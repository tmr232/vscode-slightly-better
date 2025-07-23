import * as vscode from "vscode";

type RefactorAction = {
  codeAction: vscode.CodeAction;
  text: string;
  selection: vscode.Selection;
};

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

async function expandSelection(editor: vscode.TextEditor): Promise<boolean> {
  const oldSelection = editor.selection;
  await vscode.commands.executeCommand("editor.action.smartSelect.expand");
  const newSelection = editor.selection;
  return !newSelection.isEqual(oldSelection);
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
async function collectActionsByKind(
  editor: vscode.TextEditor,
  kind: string,
): Promise<RefactorAction[]> {
  const extractionActions: RefactorAction[] = [];

  if (!editor.selection.isEmpty) {
    // If we already have a selection - we refactor using it and stop.
    const actions = await findCodeActionsByKind(
      kind,
      editor.document.uri,
      editor.selection,
    );
    const action = actions[0];
    if (action) {
      extractionActions.push({
        codeAction: action,
        text: editor.document.getText(editor.selection),
        selection: editor.selection,
      });
    }
    return extractionActions;
  }

  do {
    for (const codeAction of await findCodeActionsByKind(
      kind,
      editor.document.uri,
      editor.selection,
    )) {
      extractionActions.push({
        codeAction,
        text: editor.document.getText(editor.selection),
        selection: editor.selection,
      });
    }
  } while (await expandSelection(editor));

  return extractionActions;
}

async function chooseActionKind(
  refactorActions: RefactorAction[],
): Promise<RefactorAction[] | undefined> {
  console.log(refactorActions);
  if (refactorActions.length === 0) {
    vscode.window.showInformationMessage("No refactoring possible.");
    return;
  }

  const actionsByKind: Map<string, RefactorAction[]> = new Map();
  for (const refactorAction of refactorActions) {
    const actionKey = refactorAction.codeAction.title;
    const actions = actionsByKind.get(actionKey) ?? [];
    actions.push(refactorAction);
    actionsByKind.set(actionKey, actions);
  }

  if (actionsByKind.size === 1) {
    return refactorActions;
  }

  const selectedKind = await vscode.window.showQuickPick(
    Array.from(actionsByKind.keys()),
  );
  if (!selectedKind) {
    return;
  }
  return actionsByKind.get(selectedKind);
}

/**
 * Let the user choose which refactoring to apply
 * @param refactorActions Refactorings to choose from
 */
async function chooseAndApplyRefactoring(
  editor: vscode.TextEditor,
  refactorActions: RefactorAction[],
): Promise<void> {
  const kindActions = (await chooseActionKind(refactorActions)) ?? [];
  const [first, ...rest] = kindActions;
  if (!first) {
    return;
  }

  if (rest.length === 0) {
    await applyCodeAction(first.codeAction);
    return;
  }

  // Now we have the actions and ranges - time to choose!
  const selected = await showSelection(editor, kindActions);
  if (selected) {
    await applyCodeAction(selected.codeAction);
  }
}

class RefactorItem implements vscode.QuickPickItem {
  label: string;
  action: RefactorAction;

  constructor(refactorAction: RefactorAction) {
    this.action = refactorAction;
    this.label = refactorAction.text;
  }
}

async function showSelection(
  editor: vscode.TextEditor,
  refactorActions: RefactorAction[],
): Promise<RefactorAction | undefined> {
  const disposables: vscode.Disposable[] = [];
  const originalSelection = editor.selection;
  try {
    return await new Promise<RefactorAction | undefined>((resolve) => {
      const input = vscode.window.createQuickPick<RefactorItem>();

      input.title = "Extract Variable...";
      input.items = refactorActions.map((action) => new RefactorItem(action));
      disposables.push(
        input.onDidChangeSelection((items: readonly RefactorItem[]) => {
          const item = items[0];
          if (item) {
            resolve(item.action);
            input.hide();
          }
        }),
        input.onDidHide(() => {
          resolve(undefined);
          input.dispose();
        }),
        input.onDidChangeActive((items: readonly RefactorItem[]) => {
          const item = items[0];
          if (item) {
            editor.selection = item.action.selection;
          }
        }),
      );

      input.show();
    });
  } finally {
    editor.selection = originalSelection;
    for (const d of disposables) {
      d.dispose();
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
  const extractionActions = await collectActionsByKind(
    editor,
    "refactor.extract.variable",
  );
  editor.selection = originalSelection;
  await chooseAndApplyRefactoring(editor, extractionActions);
}

export async function extractMethod(editor: vscode.TextEditor): Promise<void> {
  const originalSelection = editor.selection;
  const extractionActions = await collectActionsByKind(
    editor,
    "refactor.extract.method",
  );
  editor.selection = originalSelection;
  await chooseAndApplyRefactoring(editor, extractionActions);
}
