import * as vscode from "vscode";

export function activate(_context: vscode.ExtensionContext) {
  vscode.commands.registerTextEditorCommand(
    "slightly-better.toggle-line-comment",
    async (editor) => {
      await vscode.commands.executeCommand("editor.action.commentLine");

      if (editor.selection.isEmpty) {
        await vscode.commands.executeCommand("cursorDown");
      }
    },
  );
}
