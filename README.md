# factorio-api-lua-defs
Generator of defines for mod development for game Factorio.

Compatible with Luanalysis IDEA plugin: https://github.com/Benjamin-Dobell/IntelliJ-Luanalysis

# How to generate
1. Install nodejs.
2. Check path to `runtime-api.json` in file `import.js`.
3. Run `node import.js`
4. Put generated file into you mod. Do not `require` it.

Tested with `api_version` = 3.
