import * as vscode from "vscode";

const MAX_EXPANSIONS = 5;
const REFACTOR_EXTRACT_VARIABLE = "refactor.extract.variable";
type RefactorAction = { codeAction: vscode.CodeAction; text: string };

/**
 * Apply an existing code action
 * @param codeAction The code action to apply
 */
async function applyCodeAction(codeAction: vscode.CodeAction): Promise<void> {
  if (codeAction.edit) {
    await vscode.workspace.applyEdit(codeAction.edit);
  }
  if (codeAction.command) {
    // This is the important part. And the only way I found to trigger a refactoring action.
    await vscode.commands.executeCommand(
      codeAction.command.command,
      ...(codeAction.command.arguments || []),
    );
  }
}

/**
 * Find all available actions of a specific kind for a code selection.
 * @param kind The kind to search for
 * @param uri The document the action applies to
 * @param selection The selection the action applies to
 * @returns All matching actions
 */
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
  return codeActions;
}

/**
 * Find the smallest variable-extraction refactoring available in the current editor line.
 * @param editor Editor to use for the search
 * @returns Smallest available refactoring if found, else undefined.
 */
async function findFirstRefactor(
  editor: vscode.TextEditor,
): Promise<RefactorAction | undefined> {
  // Expand the selection until we find a relevant refactoring,
  // or the selection exceeds a single line.
  while (editor.selection.isSingleLine) {
    await vscode.commands.executeCommand("editor.action.smartSelect.expand");
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

/**
 * Get all available extract-variable refactorings containing the current selection.
 *
 * The function works by expanding the selection again and again, and asking for the
 * available refactorings for every expansion.
 *
 * @param editor Editor to work in
 * @returns All available extract-variable refactorings expanding from the current selection.
 */
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

/**
 * Let the user choose which refactoring to apply
 * @param refactorActions Refactorings to choose from
 */
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

/**
 * Perform an interactive extract-variable refactoring
 * @param editor Editor to work inside
 */
export async function extractVariable(
  editor: vscode.TextEditor,
): Promise<void> {
  const originalSelection = editor.selection;
  const extractionActions = await collectExtractVariableActions(editor);
  editor.selection = originalSelection;
  await chooseAndApplyRefactoring(extractionActions);
}
