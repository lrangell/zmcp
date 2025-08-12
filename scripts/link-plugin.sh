#!/bin/bash

# Script to link the plugin to an Obsidian vault for development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if vault path is provided
if [ $# -eq 0 ]; then
    echo -e "${RED}Error: No vault path provided${NC}"
    echo "Usage: $0 <vault-path>"
    echo "Example: $0 ~/Documents/MyVault"
    exit 1
fi

VAULT_PATH="$1"
PLUGIN_NAME="obsidian-mcp-server"
PLUGIN_DIR="${VAULT_PATH}/.obsidian/plugins/${PLUGIN_NAME}"

# Check if vault path exists
if [ ! -d "$VAULT_PATH" ]; then
    echo -e "${RED}Error: Vault path does not exist: $VAULT_PATH${NC}"
    exit 1
fi

# Check if .obsidian directory exists
if [ ! -d "${VAULT_PATH}/.obsidian" ]; then
    echo -e "${RED}Error: Not a valid Obsidian vault (no .obsidian directory found)${NC}"
    exit 1
fi

# Create plugins directory if it doesn't exist
if [ ! -d "${VAULT_PATH}/.obsidian/plugins" ]; then
    echo -e "${YELLOW}Creating plugins directory...${NC}"
    mkdir -p "${VAULT_PATH}/.obsidian/plugins"
fi

# Remove existing plugin directory/link if it exists
if [ -e "$PLUGIN_DIR" ]; then
    echo -e "${YELLOW}Removing existing plugin directory/link...${NC}"
    rm -rf "$PLUGIN_DIR"
fi

# Get absolute path of current directory
CURRENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Create symbolic link
echo -e "${GREEN}Creating symbolic link...${NC}"
ln -s "$CURRENT_DIR" "$PLUGIN_DIR"

echo -e "${GREEN}✓ Plugin linked successfully!${NC}"
echo -e "Plugin location: ${CURRENT_DIR}"
echo -e "Linked to: ${PLUGIN_DIR}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Run 'pnpm run dev' to start watching for changes"
echo "2. Open Obsidian and enable the '${PLUGIN_NAME}' plugin"
echo "3. Reload Obsidian (Cmd/Ctrl+R) after making changes"