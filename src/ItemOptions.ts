import * as vscode from "vscode";


export interface ItemOptions
{
	label: string;
	uri: vscode.Uri;
	relativePath: string;
	isDirectory: boolean;
	diskUri?: vscode.Uri;
}
