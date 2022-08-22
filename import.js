const fs = require("fs")

// Path and options
const api = JSON.parse(fs.readFileSync("/Applications/factorio.app/Contents/doc-html/runtime-api.json").toString())
const nilsForOptionalFields = false // if false - remove `|nil` from fields. Luanalysis is not support it properly.

const out = []
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


const definesTypes = {}
const exTypes = {}

{
    out.pushLine("--- builtin_types")
    out.pushLine("---@alias LuaObject userdata")
    for (let builtinType of api.builtin_types) {
        if (/double|float|u?int\d*/.test(builtinType.name)) {
            out.pushLine("---@alias ", builtinType.name, " number")
        }
    }
    out.pushLine()
    out.pushLine()
}


{
    out.pushLine("--- defines")
    function addDefineTo(def, path) {
        if (def.values) {
            path.push(def.name)
            let typeName = path.join('.')
            let typeIdent = path.join('__')
            definesTypes[typeName] = typeIdent

            out.pushLine()
            out.pushLine(`---@class ${typeIdent}: any${desc(def.description)}`)
            for (const val of def.values) {
                out.pushLine(`  ---@field ${nameDef(val.name)} ${typeIdent}${desc(val.description)}`)
                // out.addLine(`  ---@field ${nameDef(val.name)} number${desc(val.description)}`)
            }
            path.pop()
        }
        if (def.subkeys) {
            path.push(def.name)
            let typeIdent = path.join('__')
            for (const sk of def.subkeys) {
                addDefineTo(sk, path)
            }
            out.pushLine()
            out.pushLine(`---@class ${typeIdent}: any${desc(def.description)}`)
            for (const sk of def.subkeys) {
                out.pushLine(`  ---@field ${nameDef(sk.name)} ${typeIdent}__${sk.name}${desc(sk.description)}`)
            }
            path.pop()
        }
    }
    let path = ['defines']
    for (const def of api.defines) {
        addDefineTo(def, path)
    }
    out.pushLine()
    out.pushLine(`---@class defines: any`)
    for (const def of api.defines) {
        if (!def.values && !def.subkeys) {
            out.pushLine(`  ---@field ${nameDef(def.name)} table${desc(def.description)}`)
        } else {
            out.pushLine(`  ---@field ${nameDef(def.name)} defines__${def.name}${desc(def.description)}`)
        }
    }
    out.pushLine()
    out.pushLine(`---@type defines`)
    out.pushLine(`defines = defines`)
    out.pushLine()
    out.pushLine()
}

{
    out.pushLine("--- concepts")

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

{
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
            out.pushLine(`  ---@field ${nameDef(att.name)} ${typeDefEx(att.type, null, att.optional)}${desc2(
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

{
    out.pushLine("--- events ")
    for(let ev of api.events) {
        out.pushLine()
        out.pushLine(`---@class ${snakeToCamel(ev.name)}: EventData${desc(ev.description)}`)

        for (let att of ev.data) {
            out.pushLine(`  ---@field ${nameDef(att.name)} ${typeDefEx(att.type, null, att.optional)}${desc2("; ",
                (att.optional ? "nilable" : ""),
                att.description
            )}`)
        }
    }
    out.pushLine()
    out.pushLine()
}

{
    out.pushLine("--- global_functions ")
    for(let gf of api.global_functions) {
        out.pushLine()
        addLuaMethod(gf)
        out.pushLine()
    }
    out.pushLine()
    out.pushLine()
}


{
    out.pushLine("--- global_objects ")
    for(let go of api.global_objects) {
        out.pushLine()
        out.pushLine(`---@type ${typeDef(go.type)}${desc(go.description)}`)
        out.pushLine(`${go.name} = ${go.name}`)
    }
    out.pushLine()
    out.pushLine()
}


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
            out.pushLine(`---@shape ${name}${desc(type.description)}`)
            if (type.attributes) {
                type.attributes.sort((a, b) => a.order - b.order)
                for(const att of type.attributes) {
                    out.pushLine(`  ---@field ${nameDef(att.name)} ${typeDefEx(att.type, null, att.optional)}${desc2(
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
                    out.pushLine(`  ---@field ${filedName} ${typeDefEx(par.type, null, par.optional)}${desc2(
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
                        out.pushLine(`  ---@field ${nameDef(par.name)} ${typeDefEx(par.type, null, par.optional)}${desc2(
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
        } else {
            return `[${luaLiteral(name)}]`
        }
    } else {
        throw Error(`Incorrect name: ${name}`)
    }
}

function bracketType(typeStr) {
    return  /[|<>()]/.test(typeStr) ? `(${typeStr})` : typeStr
}

function typeDefEx(type, typeNameHint, optional, brackets) {
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
        case 'tuple':
        case 'table':
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
    if (m.description) {
        out.pushLine(`--- ${m.description.replace(/[\r\n]+/g, "\n--- ")}`)
    }
    m.parameters.sort((a, b) => a.order - b.order)
    if (m.takes_table) {
        out.push(`---@param p {`)
        let second = 0
        for (let p of m.parameters) {
            second++ && out.push(", ")
            out.push(`${name(p.name)}: ${typeDefEx(p.type, null, p.optional && FORCED_OPTIONAL)}`)
        }
        out.pushLine(`}`)
        for (let p of m.parameters) {
            out.pushLine(`---@param ${name(p.name)} ${typeDefEx(p.type, null, p.optional && FORCED_OPTIONAL)}${desc(p.description)}`)
        }
        if (m.return_values?.length) {
            let desc = m.return_values.map(r => r.description).filter(r => !!r).map(r => r.replace(/\s+/g, ' ')).join("; ")
            desc = desc ? ' @' + desc : '';
            out.pushLine(`---@return ${m.return_values.map(r => typeDefEx(r.type, null, r.optional)).join(", ")}${desc}`)
        }
        if (m.table_is_optional) {
            out.pushLine(`---@overload fun()${m.return_values?.length ? ": " + m.return_values.map(r => typeDefEx(r.type, null, r.optional)).join(", ") : ""}`)
        }
        out.pushLine(`function ${className ? className + "." : ""}${m.name}(p) end`)
    } else {
        for (let p of m.parameters) {
            out.pushLine(`---@param ${name(p.name)} ${typeDefEx(p.type, null, p.optional && FORCED_OPTIONAL)}${desc(p.description)}`)
        }
        let params = [...m.parameters]
        while (true) {
            let p = params.pop()
            if (!p || !p.optional) {
                break
            }
            out.pushLine(`---@overload fun(${params.map(p => name(p.name) + ": " + typeDefEx(p.type, null, p.optional && FORCED_OPTIONAL)).join(", ")})${m.return_values?.length ? ": " + m.return_values.map(r => typeDefEx(r.type, null, r.optional)).join(", ") : ""}`)
        }
        if (m.return_values?.length) {
            let desc = m.return_values.map(r => r.description).filter(r => !!r).map(r => r.replace(/\s+/g, ' ')).join("; ")
            desc = desc ? ' @' + desc : '';
            out.pushLine(`---@return ${m.return_values.map(r => typeDefEx(r.type, null, r.optional)).join(", ")}${desc}`)
        }

        out.pushLine(`function ${className ? className + "." : ""}${m.name}(${m.parameters.map(p => name(p.name)).join(", ")}) end`)
    }
}

function snakeToCamel(snake) {
    return snake.substring(0, 1).toUpperCase() + snake.substring(1).replace(/_+([a-zA-Z0-9$])/g, (_, m) => m.toUpperCase())
}
