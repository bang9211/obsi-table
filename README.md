# Obsidian Table Manager

An advanced table creation and management plugin for Obsidian with comprehensive editing capabilities and intuitive visual interface.

## Features

### ✨ Interactive Visual Interface
- ✅ **Smart Toolbar**: Context-aware toolbar that appears when editing tables
- ✅ **PowerPoint-style Table Creator**: Visual grid selector with custom size input
- ✅ **Intelligent Positioning**: Toolbar positions itself below other plugin toolbars (e.g., Make.md)

### 🔧 Core Table Operations  
- ✅ **Table Creation**: Create new tables with specified rows and columns via visual interface
- ✅ **Row/Column Management**: Insert and delete rows/columns at cursor position
- ✅ **Row/Column Movement**: Move rows and columns up/down/left/right
- ✅ **Advanced Sorting**: Sort by any column with ascending/descending toggle
- ✅ **Table Validation**: Comprehensive table structure integrity checks

### 🎨 Visual Customization
- ✅ **Cell Background Colors**: Apply colors to single or multiple selected cells
- ✅ **Multi-cell Selection**: Drag to select rectangular areas across header and data cells  
- ✅ **Color Picker Interface**: Preset colors and full spectrum picker with hover preview
- ✅ **Mixed Selection Support**: Select and color both header and data cells together

### 📋 Import/Export Features
- ✅ **CSV Import**: Import tables from CSV files
- ✅ **CSV Export**: Export tables to CSV format
- ✅ **File Integration**: Seamless file handling with Obsidian's file system

### ⚙️ Advanced Settings
- ✅ **Configurable Defaults**: Customizable table creation settings
- ✅ **Toolbar Control**: Enable/disable interactive toolbar
- ✅ **Persistent Settings**: Settings saved across Obsidian sessions

## Installation

### Manual Installation
1. Clone or download this repository
2. Run `npm install` to install dependencies
3. Run `make build` or `npm run build` to build the plugin
4. Copy `main.js`, `manifest.json`, and `styles.css` to your Obsidian vault's `.obsidian/plugins/obsi-table/` folder
5. Restart Obsidian and enable the plugin

## Usage

### Interactive Toolbar
The plugin provides an intuitive toolbar that appears when working with tables:
- **Visual Table Creator**: Hover over the table icon to see a PowerPoint-style grid selector
- **Row/Column Operations**: Insert or delete rows and columns at your cursor position  
- **Movement Controls**: Move rows up/down or columns left/right
- **Sorting**: Click the sort button to sort by the column where your cursor is located
- **Color Picker**: Apply background colors to selected cells with the paint bucket tool
- **CSV Operations**: Import from or export to CSV files

### Multi-cell Selection
- **Drag Selection**: Click and drag to select multiple cells in a rectangular area
- **Mixed Selection**: Select both header and data cells together
- **Color Application**: Apply colors to all selected cells at once

### Commands (Ctrl/Cmd + P)
- `Create Table`: Create a new table via command palette
- `Insert Row at Cursor`: Add a row at current cursor position
- `Insert Column at Cursor`: Add a column at current cursor position  
- `Delete Row at Cursor`: Remove row where cursor is located
- `Delete Column at Cursor`: Remove column where cursor is located
- `Move Row Up/Down`: Reorder rows based on cursor position
- `Move Column Left/Right`: Reorder columns based on cursor position
- `Sort Table by Column`: Sort table by the column containing cursor
- `Import from CSV`: Import table data from CSV file
- `Export to CSV`: Export current table to CSV file

### Settings
Access plugin settings through Obsidian Settings > Community Plugins > Table Manager:
- **Default Table Size**: Set default rows and columns for new tables
- **Enable Interactive Toolbar**: Toggle the visual toolbar on/off
- **Sorting Options**: Configure sorting behavior and default directions
- **Color Preferences**: Manage default color palettes and themes
- **Import/Export Settings**: Configure CSV handling options

## Development

### Development Setup
```bash
# Install dependencies
make install

# Development mode (live build)
make dev

# Production build
make build

# Linting
make lint

# Code formatting
make format
```

### Project Structure
```
obsi-table/
├── main.ts                    # Plugin entry point
├── manifest.json             # Plugin metadata  
├── src/
│   ├── settings.ts          # Plugin settings configuration
│   ├── components/
│   │   └── TableToolbar.ts  # Interactive toolbar component
│   ├── managers/
│   │   ├── TableManager.ts  # Core table operations and CRUD
│   │   └── ToolbarManager.ts # Toolbar lifecycle management  
│   └── utils/
│       ├── MarkdownParser.ts # Markdown table parsing utilities
│       └── TableValidator.ts # Table structure validation
├── plan/                     # Development planning documents
├── tests/                    # Unit tests with Jest
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
└── Makefile                  # Unified build system
```

### Tech Stack
- **Language**: TypeScript
- **Build**: esbuild (unified build system)
- **Testing**: Jest with comprehensive unit tests  
- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier for code consistency
- **API**: Obsidian Plugin API v1.x
- **Architecture**: Component-based with Manager pattern

## Contributing

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

## License

MIT License

## Version History

### v1.0.0 (Current)
- ✅ Interactive visual toolbar with context awareness
- ✅ PowerPoint-style table creation interface  
- ✅ Complete CRUD operations (Create, Read, Update, Delete)
- ✅ Advanced row/column operations with cursor positioning
- ✅ Row/column movement (up/down/left/right)
- ✅ Multi-directional sorting by any column
- ✅ Multi-cell selection with drag support
- ✅ Cell background color customization
- ✅ Mixed selection support (header + data cells)
- ✅ CSV import and export functionality
- ✅ Comprehensive table validation
- ✅ Smart toolbar positioning (works with other plugins like Make.md)
- ✅ Configurable settings and preferences
- ✅ Full test coverage with Jest

### Planned Future Features
- 🔄 **Enhanced Import/Export**: Excel support, more file formats
- 📋 **Copy/Paste Operations**: Advanced clipboard integration
- 🔍 **Advanced Filtering**: Column-based filtering with conditions  
- 🎨 **Extended Customization**: Borders, text alignment, cell merging
- ⚡ **Performance Optimizations**: Better handling of large tables
- 🔌 **Plugin Integrations**: Better compatibility with other Obsidian plugins

## Support & Feedback

If you encounter any issues or have feature requests, please let us know through GitHub Issues.

---

**Made with ❤️ for the Obsidian community**