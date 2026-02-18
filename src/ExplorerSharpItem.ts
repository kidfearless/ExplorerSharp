import * as vscode from "vscode";
import { ItemOptions } from "./ItemOptions";


export class ExplorerSharpItem extends vscode.TreeItem
{
	public readonly relativePath: string;
	public readonly isDirectory: boolean;
	public readonly diskUri: vscode.Uri;
	public folderPath?: string;

	constructor(options: ItemOptions)
	{
		const collapsible = options.isDirectory
			? vscode.TreeItemCollapsibleState.Collapsed
			: vscode.TreeItemCollapsibleState.None;

		super(options.label, collapsible);

		this.resourceUri = options.uri;
		this.relativePath = options.relativePath;
		this.isDirectory = options.isDirectory;
		this.diskUri = options.diskUri ?? options.uri;
		this.tooltip = options.relativePath;

		if (options.isDirectory)
		{
			this.contextValue = "folder";
		}

		else
		{
			this.contextValue = "file";
			this.command = {
				command: "explorerSharp.openFile",
				title: "Open File",
				arguments: [options.uri],
			};
		}
	}
}
