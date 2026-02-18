# ExplorerSharp

ExplorerSharp is a VS Code extension that provides a custom Explorer view focused on reducing tree noise.
Turns this
<img width="421" height="411" alt="image" src="https://github.com/user-attachments/assets/08a92371-5c49-4b1f-a8c5-8603dec07fc5" />
Into this
<img width="419" height="295" alt="image" src="https://github.com/user-attachments/assets/7c7af242-6d49-4ca8-8ab0-b753a2c3bf70" />



## Features

- Hide selected folders from the ExplorerSharp view.
- Flatten single-file folders as `folder/file.ext`.
- Optionally flatten single-child directory chains.
- Refresh and unhide controls from the view toolbar.

## Commands

- `ExplorerSharp: Hide Folder`
- `ExplorerSharp: Unhide Folder`
- `ExplorerSharp: Unhide All Folders`
- `ExplorerSharp: Refresh`

## Settings

- `explorerSharp.hiddenFolders` (array): Relative folder paths to hide.
- `explorerSharp.flattenSingleFileDirectories` (boolean, default `true`): Flatten folders containing exactly one file.
- `explorerSharp.flattenSingleChildDirectories` (boolean, default `true`): Flatten single-child directory chains.

## Development

```bash
npm install
npm run compile
```

To build a VSIX package:

```bash
npx @vscode/vsce package
```

## License

MIT — see [LICENSE](LICENSE).
