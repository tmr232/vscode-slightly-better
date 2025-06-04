import * as vscode from "vscode";

const MAX_EXPANSIONS = 5;
const REFACTOR_EXTRACT_VARIABLE = "refactor.extract.variable";

async function applyCodeAction(codeAction: vscode.CodeAction): Promise<void> {
  if (codeAction.edit) await vscode.workspace.applyEdit(codeAction.edit);
  if (codeAction.command) {
    await vscode.commands.executeCommand(
      codeAction.command.command,
      ...(codeAction.command.arguments || []),
    );
  }
}

async function findCodeActionsByKind(
  kind: string,
  uri: vscode.Uri,
  selection: vscode.Selection,
): Promise<vscode.CodeAction[]> {
  const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    "vscode.executeCodeActionProvider",
    uri,
    selection,
    kind,
  );
  console.log(codeActions);
  return codeActions;
}
type RefactorAction = { codeAction: vscode.CodeAction; text: string };
async function findFirstRefactor(
  editor: vscode.TextEditor,
): Promise<RefactorAction | undefined> {
  // No selection. So we expand the selection until we can refactor.
  // If we go beyond a full line and still can't, we stop.
  console.log("initial selection:", editor.document.getText(editor.selection));
  while (editor.selection.isSingleLine) {
    await vscode.commands.executeCommand("editor.action.smartSelect.expand");
    console.log("after expansion:", editor.document.getText(editor.selection));
    const actions = await findCodeActionsByKind(
      REFACTOR_EXTRACT_VARIABLE,
      editor.document.uri,
      editor.selection,
    );
    const action = actions[0];
    if (action) {
      return {
        codeAction: action,
        text: editor.document.getText(editor.selection),
      };
    }
  }
  return undefined;
}

async function collectExtractVariableActions(
  editor: vscode.TextEditor,
): Promise<RefactorAction[]> {
  const extractionActions: RefactorAction[] = [];

  if (!editor.selection.isEmpty) {
    // If we already have a selection - we refactor using it and stop.
    const actions = await findCodeActionsByKind(
      REFACTOR_EXTRACT_VARIABLE,
      editor.document.uri,
      editor.selection,
    );
    const action = actions[0];
    if (action) {
      extractionActions.push({
        codeAction: action,
        text: editor.document.getText(editor.selection),
      });
    }
    return extractionActions;
  }

  const firstRefactor = await findFirstRefactor(editor);
  if (!firstRefactor) {
    return extractionActions;
  }

  extractionActions.push(firstRefactor);
  for (let i = 0; i < MAX_EXPANSIONS; ++i) {
    await vscode.commands.executeCommand("editor.action.smartSelect.expand");
    const actions = await findCodeActionsByKind(
      REFACTOR_EXTRACT_VARIABLE,
      editor.document.uri,
      editor.selection,
    );
    const action = actions[0];
    if (!action) {
      // Can't extract from the current selection - so probably no need to expand further.
      break;
    }
    extractionActions.push({
      codeAction: action,
      text: editor.document.getText(editor.selection),
    });
  }

  return extractionActions;
}

async function chooseAndApplyRefactoring(
  refactorActions: RefactorAction[],
): Promise<void> {
  const [first, ...rest] = refactorActions;

  if (!first) {
    vscode.window.showInformationMessage("Can't extract variable.");
    return;
  }

  if (rest.length === 0) {
    await applyCodeAction(first.codeAction);
    return;
  }

  // Now we have the actions and ranges - time to choose!
  const selected = await vscode.window.showQuickPick(
    refactorActions.map((item) => item.text),
  );
  if (selected) {
    const item = refactorActions.find((i) => i.text === selected);
    if (item) {
      await applyCodeAction(item.codeAction);
    }
  }
}

export function activate(_context: vscode.ExtensionContext) {
  vscode.commands.registerTextEditorCommand(
    "slightly-better.toggle-line-comment",
    async (editor: vscode.TextEditor) => {
      await vscode.commands.executeCommand("editor.action.commentLine");

      if (editor.selection.isEmpty) {
        await vscode.commands.executeCommand("cursorDown");
      }
    },
  );

  vscode.commands.registerTextEditorCommand(
    "slightly-better.extract-variable",
    async (editor: vscode.TextEditor) => {
      const originalSelection = editor.selection;
      const extractionActions = await collectExtractVariableActions(editor);
      editor.selection = originalSelection;
      await chooseAndApplyRefactoring(extractionActions);
    },
  );
}
