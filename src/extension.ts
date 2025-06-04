import * as vscode from "vscode";

const MAX_EXPANSIONS = 5;
const REFACTOR_EXTRACT_VARIABLE = "refactor.extract.variable";

async function applyCodeAction(codeAction: vscode.CodeAction): Promise<void> {
  await vscode.workspace.applyEdit(codeAction.edit!);
  if (codeAction.command) {
    await vscode.commands.executeCommand(codeAction.command.command, ...codeAction.command.arguments || []);
  }
}

async function findCodeActionsByKind(kind: string, uri: vscode.Uri, selection: vscode.Selection): Promise<vscode.CodeAction[]> {
  const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    'vscode.executeCodeActionProvider',
    uri,
    selection,
    kind
  );
  console.log(codeActions);
  return codeActions;
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
      const findFirstRefactor = async () => {
        // No selection. So we expand the selection until we can refactor.
        // If we go beyond a full line and still can't, we stop.
        while (editor.selection.isSingleLine) {
          await vscode.commands.executeCommand("editor.action.smartSelect.expand");
          const actions = await findCodeActionsByKind(REFACTOR_EXTRACT_VARIABLE, editor.document.uri, editor.selection);
          if (actions.length > 0) {
            return { codeAction: actions[0], text: editor.document.getText(editor.selection) };
          }
        }
        return undefined;
      }

      const extractionActions: { codeAction: vscode.CodeAction, text: string }[] = [];

      if (!editor.selection.isEmpty) {
        // If we already have a selection - we refactor using it and stop.
        const actions = await findCodeActionsByKind(REFACTOR_EXTRACT_VARIABLE, editor.document.uri, editor.selection);
        const action = actions[0];
        if (action) {
          extractionActions.push({ codeAction: action, text: editor.document.getText(editor.selection) })
        }
      } else {
        const firstRefactor = await findFirstRefactor();
        if (!firstRefactor) {
          vscode.window.showInformationMessage("Can't extract variable.");
          return;
        }
        for (let i = 0; i < MAX_EXPANSIONS; ++i) {
          await vscode.commands.executeCommand("editor.action.smartSelect.expand");
          const actions = await findCodeActionsByKind(REFACTOR_EXTRACT_VARIABLE, editor.document.uri, editor.selection);
          const action = actions[0];
          if (!action) {
            // Can't extract from the current selection - so probably no need to expand further.
            break;
          }
          extractionActions.push({ codeAction: action, text: editor.document.getText(editor.selection) })
        }
      }

      editor.selection = originalSelection;

      if (extractionActions.length === 0) {
        vscode.window.showInformationMessage("Can't extract variable.");
      } else if (extractionActions.length === 1) {
        await applyCodeAction(extractionActions[0]!.codeAction);
      } else {
        // Now we have the actions and ranges - time to choose!
        const selected = await vscode.window.showQuickPick(extractionActions.map(item => item.text));
        if (selected) {
          const item = extractionActions.find(i => i.text === selected);
          if (item) {
            await applyCodeAction(item.codeAction);
          }
        }
      }
    }
  )
}
