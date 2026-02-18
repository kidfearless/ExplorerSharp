import * as vscode from "vscode";
import * as path from "path";
import { ExplorerSharpItem } from "./ExplorerSharpItem";
import { linq } from "./enumerable";

export class ExplorerSharpProvider implements vscode.TreeDataProvider<ExplorerSharpItem>
{
	private _onDidChangeTreeData = new vscode.EventEmitter<ExplorerSharpItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private workspaceRoot: vscode.Uri, private context: vscode.ExtensionContext)
	{
	}

	refresh(): void
	{
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: ExplorerSharpItem): vscode.TreeItem
	{
		return element;
	}


	public get config(): vscode.WorkspaceConfiguration
	{
		return vscode.workspace.getConfiguration("explorerSharp");
	}

	get hiddenFolders(): string[]
	{
		return this.config.get<string[]>("hiddenFolders", []);
	}

	get shouldFlattenSingleFile(): boolean
	{
		return this.config.get<boolean>("flattenSingleFileDirectories", true);
	}

	private get shouldFlattenSingleChild(): boolean
	{
		return this.config.get<boolean>("flattenSingleChildDirectories", true);
	}

	async hideFolderFromItem(item: any): Promise<void>
	{
		let folderPath: string | undefined;

		if (item instanceof vscode.Uri)
		{
			folderPath = vscode.workspace.asRelativePath(item, false);
		}

		folderPath ??= item?.folderPath ?? item?.relativePath;

		if (!folderPath)
		{
			return;
		}

		const hidden = this.hiddenFolders;
		if (!linq(hidden).contains(folderPath))
		{
			hidden.push(folderPath);
			await this.config.update("hiddenFolders", hidden, vscode.ConfigurationTarget.Workspace);
			this.refresh();
		}
	}

	async unhideFolderFromItem(item: any): Promise<void>
	{
		if (item?.relativePath)
		{
			await this.unhideFolder(item.relativePath);
			return;
		}

		const hidden = this.hiddenFolders;
		if (hidden.length === 0)
		{
			vscode.window.showInformationMessage("ExplorerSharp: No hidden folders.");
			return;
		}

		const picked = await vscode.window.showQuickPick(hidden, {
			placeHolder: "Select a folder to unhide",
		});
		if (picked)
		{
			await this.unhideFolder(picked);
		}
	}

	private async unhideFolder(relativePath: string): Promise<void>
	{
		const filtered = linq(this.hiddenFolders).where((f) => f !== relativePath).toArray();
		await this.config.update("hiddenFolders", filtered, vscode.ConfigurationTarget.Workspace);
		this.refresh();
	}

	async unhideAllFolders(): Promise<void>
	{
		await this.config.update("hiddenFolders", [], vscode.ConfigurationTarget.Workspace);
		this.refresh();
	}

	async getChildren(element?: ExplorerSharpItem): Promise<ExplorerSharpItem[]>
	{
		if (!this.workspaceRoot)
		{
			return [];
		}

		const dirUri = element ? element.diskUri : this.workspaceRoot;
		return this.readDirectory(dirUri);
	}

	private async readDirectory(dirUri: vscode.Uri): Promise<ExplorerSharpItem[]>
	{
		const hidden = new Set(this.hiddenFolders);
		let entries: [string, vscode.FileType][];

		try
		{
			entries = await vscode.workspace.fs.readDirectory(dirUri);
		}
		catch (e)
		{
			console.error(`ExplorerSharp: Failed to read ${dirUri.fsPath}`, e);
			return [];
		}

		entries = linq<[string, vscode.FileType]>(entries)
			.orderBy(([name, type]) => type === vscode.FileType.File ? 1 : 0)
			.thenBy(([name]) => name, (a, b) => a.localeCompare(b))
			.toArray();

		const items: ExplorerSharpItem[] = [];

		for (const [name, type] of entries)
		{
			if (name.startsWith("."))
			{
				continue;
			}

			const fullUri = vscode.Uri.joinPath(dirUri, name);
			const relativePath = vscode.workspace.asRelativePath(fullUri, false);

			if (hidden.has(relativePath))
			{
				continue;
			}

			if (type === vscode.FileType.Directory)
			{
				const flatResult = await this.tryFlatten(fullUri, relativePath, hidden);
				if (flatResult)
				{
					items.push(flatResult);
				}
				else
				{
					items.push(new ExplorerSharpItem({ label: name, uri: fullUri, relativePath, isDirectory: true }));
				}
			}
			else
			{
				items.push(new ExplorerSharpItem({ label: name, uri: fullUri, relativePath, isDirectory: false }));
			}
		}

		return items;
	}

	private async tryFlatten(fullUri: vscode.Uri, relativePath: string, hidden: Set<string>): Promise<ExplorerSharpItem | undefined>
	{
		let entries: [string, vscode.FileType][];

		try
		{
			entries = await vscode.workspace.fs.readDirectory(fullUri);
		}
		catch
		{
			return undefined;
		}

		entries = linq<[string, vscode.FileType]>(entries)
			.where(([name]) =>
			{
				if (name.startsWith("."))
				{
					return false;
				}
				const childRel = vscode.workspace.asRelativePath(vscode.Uri.joinPath(fullUri, name), false);
				return !hidden.has(childRel);
			})
			.toArray();

		const dirs = linq<[string, vscode.FileType]>(entries)
			.where(([, type]) => type === vscode.FileType.Directory)
			.toArray();
		const files = linq<[string, vscode.FileType]>(entries)
			.where(([, type]) => type !== vscode.FileType.Directory)
			.toArray();

		if (this.shouldFlattenSingleFile && files.length === 1 && dirs.length === 0)
		{
			return this.flattenFile(fullUri, relativePath, files[0][0]);
		}

		if (this.shouldFlattenSingleChild && dirs.length === 1 && files.length === 0)
		{
			return this.flattenChildDir(fullUri, relativePath, dirs[0][0], hidden);
		}

		return undefined;
	}

	private flattenFile(parentUri: vscode.Uri, parentRelPath: string, fileName: string): ExplorerSharpItem
	{
		const fileUri = vscode.Uri.joinPath(parentUri, fileName);
		const fileRelative = vscode.workspace.asRelativePath(fileUri, false);
		const folderName = path.basename(parentRelPath);
		const label = `${folderName}/${fileName}`;

		const item = new ExplorerSharpItem({ label, uri: fileUri, relativePath: fileRelative, isDirectory: false });
		item.contextValue = "flatFolder";
		item.folderPath = parentRelPath;
		item.description = "";
		return item;
	}

	private async flattenChildDir(parentUri: vscode.Uri, parentRelPath: string, childName: string, hidden: Set<string>): Promise<ExplorerSharpItem>
	{
		const childUri = vscode.Uri.joinPath(parentUri, childName);
		const childRelative = vscode.workspace.asRelativePath(childUri, false);
		const folderName = path.basename(parentRelPath);
		const deeper = await this.tryFlatten(childUri, childRelative, hidden);

		if (deeper)
		{
			const label = `${folderName}/${deeper.label}`;
			const compacted = new ExplorerSharpItem({
				label,
				uri: deeper.resourceUri!,
				relativePath: deeper.relativePath,
				isDirectory: deeper.isDirectory,
				diskUri: deeper.diskUri,
			});
			compacted.contextValue = deeper.contextValue;
			compacted.folderPath = deeper.folderPath;
			return compacted;
		}

		const label = `${folderName}/${childName}`;
		return new ExplorerSharpItem({ label, uri: childUri, relativePath: childRelative, isDirectory: true, diskUri: childUri });
	}
}
