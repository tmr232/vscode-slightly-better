import * as vscode from "vscode";
import { extractMethod, extractVariable } from "./extractVariable.ts";

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
      await extractVariable(editor);
    },
  );

  vscode.commands.registerTextEditorCommand(
    "slightly-better.extract-method",
    async (editor: vscode.TextEditor) => {
      await extractMethod(editor);
    },
  );
}
