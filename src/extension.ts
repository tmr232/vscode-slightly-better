import * as vscode from "vscode";

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
      const pylanceExtension = vscode.extensions.getExtension('ms-python.vscode-pylance');
      if (!pylanceExtension) {
        vscode.window.showErrorMessage('Pylance extension is required for Python refactoring');
        return;
      }
      console.log(pylanceExtension);
      // vscode.CodeActionKind.RefactorExtract
      const range = editor.selection;
      const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        'vscode.executeCodeActionProvider',
        editor.document.uri,
        range,
        "refactor.extract.variable"
      );
      console.log(codeActions);

      const extractVariableAction = codeActions[0];
      if (extractVariableAction) {
        await vscode.workspace.applyEdit(extractVariableAction.edit!);
        if (extractVariableAction.command) {
          await vscode.commands.executeCommand(extractVariableAction.command.command, ...extractVariableAction.command.arguments || []);
        }
      }

      // console.log(vscode.commands.executeCommand("pylance.extractVariableWithRename", editor.document.uri, range));

    }
  )
}
