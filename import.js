const fs = require("fs")

// Path and options
const runtimeApi = JSON.parse(fs.readFileSync("/Applications/factorio.app/Contents/doc-html/runtime-api.json").toString())
let nilsForOptionalFields = false // if false - remove `|nil` from fields. Luanalysis is not support it properly.

const out = [
    '-- Generated lua defines of Factorio api\n',
    '-- https://github.com/dvilker/factorio-api-lua-defs\n\n',
]
out.pushLine = function (...items) {
    this.push(...items, '\n')
}
const FORCED_OPTIONAL = 1

const keywords = {
    'and': 'and_',
    'break': 'break_',
    'do': 'do_',
    'else': 'else_',
    'elseif': 'elseif_',
    'end': 'end_',
    'false': 'false_',
    'for': 'for_',
    'function': 'func',
    'if': 'if_',
    'in': 'in_',
    'local': 'local_',
    'nil': 'nil_',
    'not': 'not_',
    'or': 'or_',
    'repeat': 'repeat_',
    'return': 'return_',
    'then': 'then_',
    'true': 'true_',
    'until': 'until_',
    'while': 'while_',
}
//
// {
//     out.pushLine("--- concepts")
//     // out.pushLine("---@alias LuaObject userdata")
//     // for (let builtinType of api.builtin_types) {
//     //     if (/double|float|u?int\d*/.test(builtinType.name)) {
//     //         out.pushLine("---@alias ", builtinType.name, " number")
//     //     }
//     // }
//     for (let concept of runtimeApi.concepts) {
//         if (typeof concept.type === "object" && concept.type.complex_type === "builtin") {
//             if (/double|float|u?int\d*/.test(concept.name)) {
//                 out.pushLine("---@alias ", concept.name, " number")
//             } else if (/boolean|nil|number|string|table/.test(concept.name)) {
//                 // do nothing
//             } else if (concept.name === "LuaObject") {
//                 out.pushLine("---@alias LuaObject userdata")
//             } else {
//                 console.error("Unknown builtin concept", concept)
//                 throw Error("Unknown builtin concept")
//             }
//         } else if (typeof concept.type === "object" && concept.type.complex_type === "union") {
//             console.log(concept)
//             let type = concept.type.options.map(o => nameDef(typeof o === "object" ? o.value : o)).join(" | ")
//             out.pushLine(`---@alias ${nameDef(concept.name)} ${type}`)
//         } else {
//             out.pushLine(`---@alias ${nameDef(concept.name)} ${concept.type}`)
//         }
//     }
//     out.pushLine()
//     out.pushLine()
// }

// fs.writeFileSync(`factorio-runtime-${runtimeApi.application_version}.def.lua`, out.join(""))
//
//
// process.exit(0);

const definesTypes = {}
const exTypes = {}

// {
    out.pushLine("---@alias true true")
    out.pushLine("---@alias tuple {}")
    out.pushLine("---@alias BlueprintControlBehavior userdata")
//     out.pushLine("---@alias LuaObject userdata")
//     for (let builtinType of api.builtin_types) {
//         if (/double|float|u?int\d*/.test(builtinType.name)) {
//             out.pushLine("---@alias ", builtinType.name, " number")
//         }
//     }
//     out.pushLine()
//     out.pushLine()
// }
const api = runtimeApi

{
    let defTypes = []
    function addDefine(def, indent, fullname) {
        if (def.description) {
            out.pushLine(`${indent}--- ${def.description}`)
        }
        out.pushLine(`${indent}${nameDef(def.name)} = {`)
        if (def.values) {
            defTypes.push(`---@alias ${fullname.replaceAll('-', '_')} number`)
            for (const val of def.values) {
                if (val.description) {
                    out.pushLine(`${indent}  --- ${val.description}`)
                }
                out.pushLine(`${indent}  ${nameDef(val.name)} = ${val.order},`)
            }
        }
        if (def.subkeys) {
            for (const subkey of def.subkeys) {
                addDefine(subkey, `${indent}  `, fullname + "." + subkey.name)
            }
        }
        out.pushLine(`${indent}},`)
    }
    out.pushLine("--- defines")
    out.pushLine()
    out.pushLine(`defines = {`)
    for (const def of api.defines) {
        addDefine(def, '  ', "defines." + def.name)
    }
    out.pushLine(`}`)
    out.pushLine()
    defTypes.forEach(t => out.pushLine(t))
    out.pushLine()
    out.pushLine()
}

{
    if (!api.concepts && api.types) {
        api.concepts = api.types
        if (api.prototypes) {
            api.concepts = api.concepts.concat(api.prototypes)
        }
        out.pushLine("--- types")
    } else {
        out.pushLine("--- concepts")
    }

    for (const con of api.concepts) {
        let typeName = typeDef(con.type, con.name)
        if (typeName !== con.name) {
            out.pushLine(`  ---@alias ${nameDef(con.name)} ${typeName}`)
            // out.addLine(`  ---@alias ${nameDef(con.name)} ${typeName}${desc(con.description)}`)
        }
    }
    out.pushLine()
    out.pushLine()
}

nilsForOptionalFields = false

if (api.classes) {
    out.pushLine("--- classes ")
    for(let cls of api.classes) {
        let baseClasses = cls.base_classes?.length ? ': ' + cls.base_classes.join(", ") : ': any';
        out.pushLine()
        out.pushLine(`---@class ${cls.name}${baseClasses}${desc(cls.description)}`)
        for (let op of cls.operators) {
            if (op.name === 'call') {
                out.pushLine(`  ---@overload ${callableTypeDef(op)}`)
            }
        }
        for (let att of cls.attributes) {
            out.pushLine(`  ---@field ${nameDef(att.name)} ${typeDefEx(att, null, att.optional)}${desc2(
                "; ",
                (att.read ? "R" : "") + (att.read ? "W" : "") + (att.optional ? " nilable" : ""),
                att.description
            )}`)
        }
        out.pushLine(`${cls.name} = {}`)

        for (let m of cls.methods) {
            out.pushLine()
            addLuaMethod(m, cls.name)
            // out.addLine(`  ---@field ${nameDef(m.name)} ${callableTypeDef(m)}${desc(m.description)}`)
        }
    }
    out.pushLine()
    out.pushLine()
}

if (api.events) {
    out.pushLine("--- events ")
    for(let ev of api.events) {
        out.pushLine()
        out.pushLine(`---@class ${snakeToCamel(ev.name)}: EventData${desc(ev.description)}`)

        for (let att of ev.data) {
            out.pushLine(`  ---@field ${nameDef(att.name)} ${typeDefEx(att, null, att.optional)}${desc2("; ",
                (att.optional ? "nilable" : ""),
                att.description
            )}`)
        }
    }
    out.pushLine()
    out.pushLine()
}

if (api.global_functions) {
    out.pushLine("--- global_functions ")
    for(let gf of api.global_functions) {
        out.pushLine()
        addLuaMethod(gf)
        out.pushLine()
    }
    out.pushLine()
    out.pushLine()
}


if (api.global_objects) {
    out.pushLine("--- global_objects ")
    for(let go of api.global_objects) {
        out.pushLine()
        out.pushLine(`---@type ${typeDef(go.type)}${desc(go.description)}`)
        out.pushLine(`${go.name} = ${go.name}`)
    }
    out.pushLine()
    out.pushLine()
}

nilsForOptionalFields = true
{
    out.pushLine()
    out.pushLine("--- ex types")
    const processed = new Set()
    let processCount
    do {
        processCount = 0
        for (const name of Object.keys(exTypes)) {
            if (processed.has(name)) {
                continue
            }
            processed.add(name)
            processCount ++
            const type = exTypes[name]
            out.pushLine()
            // out.pushLine(`---@shape ${name}${desc(type.description)}`)
            out.pushLine(`---@class ${name}${desc(type.description)}`)
            if (type.attributes) {
                type.attributes.sort((a, b) => a.order - b.order)
                for(const att of type.attributes) {
                    out.pushLine(`  ---@field ${nameDef(att.name)} ${typeDefEx(att, null, att.optional)}${desc2(
                        "; ",
                        (att.read ? "R" : "") + (att.read ? "W" : "") + (att.optional ? " nilable" : ""),
                        att.description
                    )}`)
                }
            }
            if (type.parameters) {
                type.parameters.sort((a, b) => a.order - b.order)
                for (const par of type.parameters) {
                    let filedName = type.complex_type === 'tuple' ? `[${par.order + 1}]` : nameDef(par.name)
                    out.pushLine(`  ---@field ${filedName} ${typeDefEx(par, null, par.optional)}${desc2(
                        "; ",
                        (par.optional ? "nilable" : ""),
                        par.description
                    )}`)
                }
            }

            if (type.variant_parameter_groups) {
                type.variant_parameter_groups.sort((a, b) => a.order - b.order)
                for (const pg of type.variant_parameter_groups) {
                    pg.parameters.sort((a, b) => a.order - b.order)
                    for (const par of pg.parameters) {
                        out.pushLine(`  ---@field ${nameDef(par.name)} ${typeDefEx(par, null, par.optional)}${desc2(
                            "; ",
                            (par.optional ? "nilable" : ""),
                            pg.name,
                            par.description
                        )}`)
                    }
                }
            }
        }
    } while (processCount > 0)
    out.pushLine()
}


fs.writeFileSync(`factorio-${api.application_version}.def.lua`, out.join(""))

function desc(arg) {
    return desc2('', arg)
}

function desc2(delimiter, ...args) {
    if (!args.length) {
        return ''
    }
    args = args.filter(i => i !== null && i !== undefined && i !== '')
    if (!args.length) {
        return ''
    }
    let description = args.join(delimiter)
    return description ? ` @${description.replace(/\s+/g, ' ')}` : ''
}

function name(name) {
    return keywords.hasOwnProperty(name) ? keywords[name] : name
}

function nameDef(name) {
    if (typeof name === "number") {
        return `[${name}]`
    } else if (typeof name === "string") {
        if (/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(name)) {
            return name
        } else if (/^[a-zA-Z_][a-zA-Z_0-9-]*$/.test(name)) {
            return name.replaceAll('-', '__')
        } else {
            console.log(name)
            return `[${luaLiteral(name)}]`
        }
    } else {
        throw Error(`Incorrect name: ${name}`)
    }
}

function bracketType(typeStr) {
    return  /[|<>()]/.test(typeStr.replace(/"[^"]*"/g, "")) ? `(${typeStr})` : typeStr
}

function typeDefEx(typeHolder, typeNameHint, optional, brackets) {
    let type = typeHolder.type
    if (!type && (typeHolder.read_type || typeHolder.write_type)) {
        let readTypeDef = typeHolder.read_type && typeDefEx({type: typeHolder.read_type}, typeNameHint, optional)
        let writeTypeDef = typeHolder.write_type && typeDefEx({type: typeHolder.write_type}, typeNameHint, optional)
        if (!readTypeDef || !writeTypeDef || readTypeDef === writeTypeDef) {
            return readTypeDef || writeTypeDef
        } else {
            return `${readTypeDef}  | ${writeTypeDef}`
        }
    }
    if (!nilsForOptionalFields && optional !== FORCED_OPTIONAL) {
        optional = false
    }
    if (optional && brackets) {
        return bracketType(bracketType(typeDef(type, typeNameHint)) + "|nil")
    } else if (optional) {
        return bracketType(typeDef(type, typeNameHint)) + "|nil"
    } else if (brackets) {
        return bracketType(typeDef(type, typeNameHint))
    } else {
        return typeDef(type, typeNameHint)
    }
}

function typeDef(type, typeNameHint, lazy) {
    if (typeof type === "string") {
        return definesTypes.hasOwnProperty(type) ? definesTypes[type] : type
    }
    switch (type.complex_type) {
        case 'type': {
            return typeDef(type.value, typeNameHint)
        }
        case 'array': {
            return bracketType(typeDef(type.value, typeNameHint)) + "[]"
        }
        case 'union': {
            return type.options.map(t => bracketType(typeDef(t, typeNameHint, true))).join(" | ")
        }
        case 'dictionary':
        case 'LuaCustomTable': {
            return `table<${typeDef(type.key, typeNameHint, true)}, ${typeDef(type.value, typeNameHint, true)}>`
        }
        case 'function': {
            return `fun(${type.parameters.map((t, i) => `p${i}: ${typeDef(t)}`).join(", ")})`
        }
        case 'literal': {
            return luaLiteral(type.value)
        }
        case 'LuaLazyLoadedValue': {
            return typeDef(type.value, typeNameHint)
        }
        case 'table': {
            type.parameters.sort((a, b) => a.order - b.order)
            return `{${type.parameters.map(p => `${nameDef(p.name)}: ${typeDef(p.type)}`).join(", ")}}`
        }
        case 'tuple': {
            return `tuple<${type.values.map(typeDef).join(", ")}>`
        }
        case 'table1':
        case 'tuple1':
        case 'LuaStruct':
        case 'struct': {
            let typeName
            if (typeNameHint && !exTypes.hasOwnProperty(typeNameHint) && !lazy) {
                typeName = typeNameHint
            } else {
                typeName = '_' + (typeNameHint || type.complex_type || 'type')
                let i = 1;
                while (exTypes.hasOwnProperty(typeName + i)) {
                    i ++
                }
                typeName = typeName + i
            }
            exTypes[typeName] = type
            return typeName
        }
        case 'builtin': {
            if (/double|float|u?int\d*/.test(typeNameHint)) {
                return "number"
            } else if (/boolean|nil|number|string|table/.test(typeNameHint)) {
                return typeNameHint
            } else if (typeNameHint === "LuaObject") {
                return "userdata"
            } else {
                console.error("Unknown builtin type", typeNameHint)
                throw Error("Unknown builtin type")
            }
        }
    }
}

function callableTypeDef(callable) {
    if (callable.parameters) {
        callable.parameters.sort((a, b) => a.order - b.order)
    }
    let out = ['fun(']
    if (callable.takes_table) {
        out.push("params: {")
        let second = 0
        for (let par of callable.parameters) {
            if (second++) {
                out.push(", ")
            }
            if (par.name) {
                out.push(par.name, ": ")
            }
            out.push(typeDef(par.type))
            if (par.optional) {
                out.push("|nil")
            }
        }
        out.push("}")
        if (callable.table_is_optional) {
            out.push("|nil")
        }
    } else {
        let second = 0
        for (let par of callable.parameters) {
            if (second++) {
                out.push(", ")
            }
            if (par.name) {
                out.push(par.name, ": ")
            }
            out.push(typeDef(par.type))
            if (par.optional) {
                out.push("|nil")
            }
        }
        if (callable.variadic_type) {
            if (second++) {
                out.push(", ")
            }
            out.push("...: ")
            out.push(typeDef(callable.variadic_type))
        }
    }
    out.push(")")
    if (callable.return_values?.length) {
        out.push(": ")
        let second = 0
        for (let par of callable.return_values) {
            if (second++) {
                out.push(", ")
            }
            out.push(typeDef(par.type))
            if (par.optional) {
                out.push("|nil")
            }
        }

    }
    return out.join("")

}


function luaLiteral(v) {
    if (v === null || v === undefined) {
        return "nil"
    }
    switch (typeof v) {
        case "number":
        case "boolean":
            return v.toString()
        case "string":
            return JSON.stringify(v)
        default:
            throw Error(`Unknown literal type: ${typeof v}`)
    }
}


function addLuaMethod(m, className) {
    m.parameters.sort((a, b) => a.order - b.order)
    if (m.takes_table) {
        // out.pushLine(`---@shape ${className ? className + "_" : ""}${m.name}_params`)
        out.pushLine(`---@class ${className ? className + "_" : ""}${m.name}_params`)
        for (let p of m.parameters) {
            out.pushLine(`   ---@field ${name(p.name)} ${typeDefEx(p, null, p.optional && FORCED_OPTIONAL)}${desc(p.description)}`)
        }
        out.pushLine()
        if (m.description) {
            out.pushLine(`--- ${m.description.replace(/[\r\n]+/g, "\n--- ")}`)
        }
        out.pushLine(`---@param p ${className ? className + "_" : ""}${m.name}_params`)
        if (m.return_values?.length) {
            let desc = m.return_values.map(r => r.description).filter(r => !!r).map(r => r.replace(/\s+/g, ' ')).join("; ")
            desc = desc ? ' @' + desc : '';
            out.pushLine(`---@return ${m.return_values.map(r => typeDefEx(r, null, r.optional)).join(", ")}${desc}`)
        }
        if (m.table_is_optional) {
            out.pushLine(`---@overload fun()${m.return_values?.length ? ": " + m.return_values.map(r => typeDefEx(r, null, r.optional)).join(", ") : ""}`)
        }
        out.pushLine(`function ${className ? className + "." : ""}${m.name}(p) end`)
    } else {
        if (m.description) {
            out.pushLine(`--- ${m.description.replace(/[\r\n]+/g, "\n--- ")}`)
        }
        for (let p of m.parameters) {
            out.pushLine(`---@param ${name(p.name)} ${typeDefEx(p, null, p.optional && FORCED_OPTIONAL)}${desc(p.description)}`)
        }
        let params = [...m.parameters]
        while (true) {
            let p = params.pop()
            if (!p || !p.optional) {
                break
            }
            out.pushLine(`---@overload fun(${params.map(p => name(p.name) + ": " + typeDefEx(p, null, p.optional && FORCED_OPTIONAL)).join(", ")})${m.return_values?.length ? ": " + m.return_values.map(r => typeDefEx(r, null, r.optional)).join(", ") : ""}`)
        }
        if (m.return_values?.length) {
            let desc = m.return_values.map(r => r.description).filter(r => !!r).map(r => r.replace(/\s+/g, ' ')).join("; ")
            desc = desc ? ' @' + desc : '';
            out.pushLine(`---@return ${m.return_values.map(r => typeDefEx(r, null, r.optional)).join(", ")}${desc}`)
        }

        out.pushLine(`function ${className ? className + "." : ""}${m.name}(${m.parameters.map(p => name(p.name)).join(", ")}) end`)
    }
}

function snakeToCamel(snake) {
    return snake.substring(0, 1).toUpperCase() + snake.substring(1).replace(/_+([a-zA-Z0-9$])/g, (_, m) => m.toUpperCase())
}
