#!/bin/bash
set -e  # Exit immediately if a command exits with a non-zero status

rm -rf lib 
npm run build
firebase emulators:start --import=../firebase-data --export-on-exit