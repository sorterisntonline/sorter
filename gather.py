#!/usr/bin/env python3

import os
import sys
import subprocess
from pathlib import Path

EXTENSIONS = {'.jsx', '.clj', '.sql', '.rs'}

def is_git_repo(directory):
    try:
        subprocess.run(['git', 'rev-parse', '--git-dir'], 
                      cwd=directory, 
                      capture_output=True, 
                      check=True)
        return True
    except subprocess.CalledProcessError:
        return False

def get_git_files(directory):
    try:
        result = subprocess.run(['git', 'ls-files'], 
                              cwd=directory, 
                              capture_output=True, 
                              check=True, 
                              text=True)
        files = result.stdout.splitlines()
        return [f for f in files if Path(f).suffix in EXTENSIONS]
    except subprocess.CalledProcessError:
        return []

def process_directory(output_file, directory):
    directory = Path(directory).resolve()
    print(f"Processing directory: {directory}")
    
    if not directory.is_dir():
        print(f"Error: Not a directory: {directory}")
        return
    
    if not is_git_repo(directory):
        print(f"Warning: {directory} is not a git repository")
        return
    
    print(f"Found git repository in {directory}")
    
    for file in get_git_files(directory):
        file_path = directory / file
        if file_path.is_file():
            print(f"Processing file: {file}")
            with open(output_file, 'a', encoding='utf-8') as out:
                out.write(f"\n=== {file_path} ===\n")
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        out.write(f.read())
                    out.write('\n\n')
                except UnicodeDecodeError:
                    print(f"Warning: Could not read {file} as text")

def main():
    if len(sys.argv) < 3:
        print("Usage: script.py output_file directory1 [directory2 ...]")
        sys.exit(1)
    
    output_file = Path(sys.argv[1]).resolve()
    directories = sys.argv[2:]
    
    # Clear/create output file
    output_file.write_text('')
    
    for directory in directories:
        process_directory(output_file, directory)

if __name__ == '__main__':
    main()
