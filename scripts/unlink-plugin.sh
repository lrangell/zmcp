#!/bin/bash

# Script to unlink the plugin from an Obsidian vault

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

# Check if plugin link exists
if [ ! -e "$PLUGIN_DIR" ]; then
    echo -e "${YELLOW}Plugin is not linked in this vault${NC}"
    exit 0
fi

# Check if it's a symbolic link
if [ -L "$PLUGIN_DIR" ]; then
    echo -e "${YELLOW}Removing symbolic link...${NC}"
    rm "$PLUGIN_DIR"
    echo -e "${GREEN}✓ Plugin unlinked successfully!${NC}"
else
    echo -e "${RED}Warning: Plugin directory exists but is not a symbolic link${NC}"
    echo "Path: $PLUGIN_DIR"
    read -p "Do you want to remove it anyway? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$PLUGIN_DIR"
        echo -e "${GREEN}✓ Plugin directory removed${NC}"
    else
        echo "Cancelled"
    fi
fi