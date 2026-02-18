import * as vscode from "vscode";
import { ExplorerSharpProvider } from "./explorerSharpProvider";

export function activate(context: vscode.ExtensionContext)
{
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
	if (!workspaceRoot)
	{
		return;
	}

	const provider = new ExplorerSharpProvider(workspaceRoot, context);

	context.subscriptions.push(
		vscode.window.createTreeView("explorerSharp", { treeDataProvider: provider, showCollapseAll: true }),
		vscode.commands.registerCommand("explorerSharp.hideFolder", (item) => provider.hideFolderFromItem(item)),
		vscode.commands.registerCommand("explorerSharp.unhideFolder", (item) => provider.unhideFolderFromItem(item)),
		vscode.commands.registerCommand("explorerSharp.unhideAll", () => provider.unhideAllFolders()),
		vscode.commands.registerCommand("explorerSharp.refresh", () => provider.refresh()),
		vscode.commands.registerCommand("explorerSharp.openFile", (uri) => vscode.window.showTextDocument(uri)),
	);

	const fileWatcher = vscode.workspace.createFileSystemWatcher("**/*");
	fileWatcher.onDidCreate(() => provider.refresh());
	fileWatcher.onDidDelete(() => provider.refresh());
	fileWatcher.onDidChange(() => provider.refresh());



	context.subscriptions.push(fileWatcher,vscode.workspace.onDidChangeConfiguration(() => provider.refresh()));
}


export function deactivate()
{
}
