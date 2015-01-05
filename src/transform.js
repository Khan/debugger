var LinkedList = require("basic-ds").LinkedList;
var Stack = require("basic-ds").Stack;
var b = require("ast-types").builders;
var escodegen = require("escodegen");
var escope = require("escope");
var esprima = require("esprima-fb");
var estraverse = require("estraverse");
var regenerator = require("regenerator");


var assignmentStatement = function(left, right, loc) {
    var stmt = b.expressionStatement(
        b.assignmentExpression("=", left, right)
    );
    stmt.loc = loc;
    return stmt;
};


var rewriteVariableDeclarations = function(bodyList, scopeStack, context) {
    var nodes = [];
    bodyList.forEachNode(listNode => {
        if (listNode.value.type === "VariableDeclaration") {
            nodes.push(listNode);
        }
    });

    nodes.forEach(node => {
        var replacements = [];

        node.value.declarations.forEach(decl => {
            if (decl.init !== null) {
                var scopeName = getScopeName(scopeStack, context, decl.id.name);
                if (scopeName) {
                    replacements.push(assignmentStatement(
                        memberExpression(scopeName, decl.id.name), decl.init, decl.loc
                    ));
                }
            }
        });

        if (replacements.length > 0) {
            bodyList.replaceNodeWithValues(node, replacements);
        }
    });
};


var isBreakpoint = function(node) {
    if (node.type === "ExpressionStatement") {
        var expr = node.expression;
        if (expr.type === "YieldExpression") {
            var arg = expr.argument;
            if (arg.type === "ObjectExpression") {
                return arg.properties.some(prop => {
                    return prop.key.name === "breakpoint";
                });
            }
        }
    }
    return false;
};


var insertYields = function(bodyList) {
    bodyList.forEachNode(listNode => {
        var astNode = listNode.value;
        if (isBreakpoint(astNode)) {
            return;
        }

        var line = astNode.loc.start.line;
        bodyList.insertBeforeNode(listNode, yieldObject({ line: line }));
    });
};


var stringForId = function(node) {
    var name = "";
    if (node.type === "Identifier") {
        if (node.name.indexOf("$scope$") === -1) {
            name = node.name;
        }
    } else if (node.type === "MemberExpression") {
        var part = stringForId(node.object);
        if (part.length > 0) {
            name = stringForId(node.object) + "." + node.property.name;
        } else {
            name = node.property.name;
        }
    } else if (node.type === "ThisExpression") {
        name = "this";
    } else {
        throw "can't call stringForId on nodes of type '" + node.type + "'";
    }
    return name;
};


var getNameForFunctionExpression = function(node) {
    var name = "";
    if (node._parent.type === "Property") {
        name = node._parent.key.name;
        if (node._parent._parent.type === "ObjectExpression") {
            name = getNameForFunctionExpression(node._parent._parent) + "." + name;
        }
    } else if (node._parent.type === "AssignmentExpression") {
        name = stringForId(node._parent.left);
    } else if (node._parent.type === "VariableDeclarator") {
        name = stringForId(node._parent.id);
    } else {
        name = "<anonymous>"; // TODO: test anonymous callbacks
    }
    return name;
};


var isReference = function(node, parent) {
    // we're a property key so we aren't referenced
    if (parent.type === "Property" && parent.key === node) return false;

    // we're a variable declarator id so we aren't referenced
    if (parent.type === "VariableDeclarator" && parent.id === node) return false;

    var isMemberExpression = parent.type === "MemberExpression";

    // we're in a member expression and we're the computed property so we're referenced
    var isComputedProperty = isMemberExpression && parent.property === node && parent.computed;

    // we're in a member expression and we're the object so we're referenced
    var isObject = isMemberExpression && parent.object === node;

    // we are referenced
    return !isMemberExpression || isComputedProperty || isObject;
};


var assignmentForDeclarator = function(scopeName, decl) {
    var ae = b.assignmentExpression(
        "=", memberExpression(scopeName, decl.id.name), decl.init);
    ae.loc = decl.loc;
    return ae;
};


var getScopeName = function(scopeStack, context, name) {
    var scopes = scopeStack.items;

    // TODO: store the scope names in the scope variables so they're easier to retrieve
    for (var i = scopes.length - 1; i > -1; i--) {
        var scope = scopes[i];
        if (scope.hasOwnProperty(name)) {
            return "$scope$" + i;
        }
    }
    if (context.hasOwnProperty(name)) {
        return contextName;
    }
};


var callInstantiate = function(node) {
    var name = stringForId(node.callee);
    node.arguments.unshift(b.literal(name));    // constructor name
    node.arguments.unshift(node.callee);        // constructor
    return b.callExpression(
        memberExpression(contextName, "__instantiate__"), node.arguments
    );
};


var declareVariable = function(name, value) {
    return b.variableDeclaration(
        "var",
        [b.variableDeclarator(
            b.identifier(name),
            value
        )]
    );
};


var memberExpression = function(objName, propName) {
    return b.memberExpression(
        b.identifier(objName),
        b.identifier(propName),
        false
    );
};


var objectExpression = function(obj) {
    return b.objectExpression(Object.keys(obj).map(key => {
        var val = obj[key];
        if (typeof val === "object") {
            return b.property("init", b.identifier(key), val);
        } else {
            return b.property("init", b.identifier(key), b.literal(obj[key]));
        }
    }));
};


var yieldObject = function(obj) {
    return b.expressionStatement(b.yieldExpression(objectExpression(obj)));
};


var addScopeDict = function(scopeStack, bodyList) {
    var scopeName = "$scope$" + (scopeStack.size - 1);
    var scope = scopeStack.peek();

    bodyList.first.value.expression.argument.properties.push(
        b.property("init", b.identifier("scope"), b.identifier(scopeName))
    );

    var scopeDict = b.objectExpression(Object.keys(scope).map(name => {
        var type = scope[name].type;
        var value = type === "Parameter" ? name : "undefined";
        return b.property("init", b.identifier(name), b.identifier(value));
    }));

    bodyList.push_front(declareVariable(scopeName, scopeDict));
};


var getFunctionName = function(node, parent) {
    if (parent.type === "FunctionDeclaration") {
        return stringForId(parent.id);
    } else if (parent.type === "FunctionExpression") {
        return getNameForFunctionExpression(parent);
    } else if (node.type === "Program") {
        return "<PROGRAM>";
    }
};


var compile = function(ast, options) {
    var debugCode, generator;
    
    if (options.nativeGenerators) {
        debugCode = "return function*(" + contextName + "){\n" + escodegen.generate(ast) + "\n}";

        generator = new Function(debugCode);
    } else {
        // regenerator likes functions so wrap the code in a function
        var entry = b.functionDeclaration(
            b.identifier("entry"),
            [b.identifier(contextName)],
            b.blockStatement(ast.body),
            true,   // generator 
            false   // expression
        );

        regenerator.transform(entry);
        debugCode = escodegen.generate(entry);

        generator = new Function(debugCode + "\n" + "return entry;");
    }
    
    if (options.debug) {
        console.log(debugCode);
    }
    
    return generator;
};


// randomized global
var contextName;


var transform = function(code, context, options) {
    var ast, scopeManager, scopeStack;
    
    ast = esprima.parse(code, { loc: true });
    scopeManager = escope.analyze(ast);
    scopeManager.attach();
    
    scopeStack = new Stack();
    contextName = "context" + Date.now();

    estraverse.replace(ast, {
        enter: (node, parent) => {
            if (node.__$escope$__) {
                var scope = {};
                var isRoot = scopeStack.size === 0;
                
                node.__$escope$__.variables.forEach(variable => {
                    // don't include variables from the context in the root scope
                    if (isRoot && context.hasOwnProperty(variable.name)) {
                        return;
                    }

                    if (variable.defs.length > 0) {
                        scope[variable.name] = {
                            type: variable.defs[0].type
                        };
                    }
                });

                scopeStack.push(scope);
            }
            
            node._parent = parent;
        },
        leave: (node, parent) => {
            if (node.type === "FunctionExpression" || node.type === "FunctionDeclaration") {
                // convert all user defined functions to generators
                node.generator = true;
                
                if (node.type === "FunctionDeclaration") {
                    scopeName = "$scope$" + (scopeStack.size - 1);
                    return assignmentStatement(
                        memberExpression(scopeName, node.id.name),
                        b.functionExpression(null, node.params, node.body, true, false),
                        node.loc
                    );
                }
            } else if (node.type === "Program" || node.type === "BlockStatement") {
                var bodyList = LinkedList.fromArray(node.body);
                
                // rewrite variable declarations first
                rewriteVariableDeclarations(bodyList, scopeStack, context);
                
                // insert yield statements between each statement 
                insertYields(bodyList);

                if (bodyList.first === null) {
                    bodyList.push_back(yieldObject({ line: node.loc.end.line }));
                }

                var functionName = getFunctionName(node, parent);
                if (functionName) {
                    // modify the first yield statement so that the object
                    // returned contains the function's name
                    bodyList.first.value.expression.argument.properties.push(
                        b.property("init", b.identifier("name"), b.literal(functionName))
                    );

                    addScopeDict(scopeStack, bodyList);
                    scopeStack.pop();
                }

                node.body = bodyList.toArray();
            } else if (node.type === "CallExpression" || node.type === "NewExpression") {
                var obj = {
                    gen: node.type === "NewExpression" ? callInstantiate(node) : node,
                    line: node.loc.start.line
                };

                // TODO: obj.line is the current line, but we should actually be passing next node's line
                // TODO: handle this in when the ForStatement is parsed where we have more information

                // We add an extra property to differentiate function calls
                // that are followed by a statment from those that aren't.
                // The former requires taking an extra _step() to get the
                // next line.
                if (parent._parent.type === "ExpressionStatement" || parent.type === "ExpressionStatement") {
                    obj.stepAgain = true;
                }

                // TODO: should also check to make sure that it's not part another kind of loop
                // this function call is part of a variable declaration but not part of a "ForStatement"
                if (parent.type === "VariableDeclarator" && parent._parent._parent.type !== "ForStatement") {
                    obj.stepAgain = true;
                }

                return b.yieldExpression(objectExpression(obj));
            } else if (node.type === "DebuggerStatement") {
                return yieldObject({
                    line: node.loc.start.line,
                    breakpoint: true
                });
            } else if (node.type === "Identifier" && parent.type !== "FunctionExpression" && parent.type !== "FunctionDeclaration") {
                if (isReference(node, parent)) {
                    var scopeName = getScopeName(scopeStack, context, node.name);
                    if (scopeName) {
                        return memberExpression(scopeName, node.name);
                    }
                }
            } else if (node.type === "VariableDeclaration" && parent.type === "ForStatement") {
                var replacements = [];
                node.declarations.forEach(decl => {
                    if (decl.init !== null) {
                        var scopeName = getScopeName(scopeStack, context, decl.id.name);
                        if (scopeName) {
                            replacements.push(assignmentForDeclarator(scopeName, decl));
                        }
                    }
                });
                
                if (replacements.length === 1) {
                    return replacements[0];
                } else if (replacements.length > 1) {
                    return b.sequenceExpression(replacements);
                } else {
                    return null;
                }
            }

            // clean up
            delete node._parent;
        }
    });
 
    return compile(ast, options);
};

module.exports = transform;
