#!/bin/bash

echo "Building Backend and Web applications..."

# Build Backend (api)
echo "Building Backend..."
cd api
npm install
npx tsc
echo "Backend built successfully"

# Build Web
echo "Building Web application..."
cd ../web
npm install
npm run build
echo "Web application built successfully"

echo ""
echo "Build completed!"
echo "Backend compiled to: api/dist/"
echo "Web built to: web/dist/"
echo ""
echo "To run the backend: cd api && npm start"
echo "To serve the web build: cd web && npm run preview" 