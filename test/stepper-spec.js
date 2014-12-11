/*global describe, it, beforeEach, afterEach */

describe("Stepper", function () {

    var stepper, context;
    var fill, rect, print;

    function stepperWithCode(code, breakpoints, breakCallback, doneCallback) {
        var debugr = new ProcessingDebugger(context);
        debugr.load(code);
        //var debugCode = transform(code, context);
        //var debugFunction = new Function(debugCode);
        var mainGenerator = debugr.mainGenerator;

        breakpoints = breakpoints || {};
        return new Stepper(mainGenerator(context), breakpoints, breakCallback, doneCallback);
    }

    beforeEach(function () {
        fill = sinon.stub();
        rect = sinon.stub();
        print = sinon.stub();

        context = {
            fill: fill,
            rect: rect,
            x: 0,
            y: 0,
            p: null,
            numbers: [],
            print: print,
            Vector: function (x,y) {
                this.x = x;
                this.y = y;
            }
        };
    });

    describe("start", function () {
        beforeEach(function () {
            stepper = stepperWithCode("fill(255,0,0);x=5;console.log('hello');_test_global='apple';var z=23;");
            sinon.stub(console, "log");
            window._test_global = "";
        });

        afterEach(function () {
            console.log.restore();
            delete window._test_global;
        });

        it("should call functions in the context", function () {
            stepper.start();
            expect(context.fill.calledWith(255,0,0)).to.be(true);
        });

        it("shouldn't run again", function () {
            stepper.start();
            stepper.start();
            expect(context.fill.callCount).to.be(1);
        });

        it("should be stopped after running", function () {
            stepper.start();
            expect(stepper.stopped).to.be(true);
        });

        it("should set variables in the context", function () {
            stepper.start();
            expect(context.x).to.equal(5);
        });

        it("should call global functions", function () {
            stepper.start();
            expect(console.log.calledWith("hello")).to.be(true);
        });

        it("should set global variables", function () {
            stepper.start();
            expect(window._test_global).to.be("apple");
        });

        it("shouldn't set local variables on the context", function () {
            stepper.start();
            expect(context.z).to.be(undefined);
        });
    });

    describe("stepOver", function () {
        it("should return the current line number", function () {
            var code = "fill(255,0,0);" +
                "x=5;" +
                "y=10;";
            stepper = stepperWithCode(code);
            stepper.stepOver();
            expect(stepper.line).to.be(1);   // line numbers start at 1
        });

        it("should call run each step one at a time", function () {
            var code = "fill(255,0,0);x=5;y=10;";
            stepper = stepperWithCode(code);

            stepper.stepOver();

            stepper.stepOver();
            expect(context.fill.calledWith(255,0,0)).to.be(true);
            expect(context.x).to.equal(0);
            expect(context.y).to.equal(0);

            stepper.stepOver();
            expect(context.x).to.equal(5);
            expect(context.y).to.equal(0);

            stepper.stepOver();
            expect(context.y).to.equal(10);
        });

        it("should step through loops", function () {
            var code = getFunctionBody(function () {
                for (var i = 0; i < 3; i++) {
                    numbers[i] = i + 1;
                }
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver(); // for(...)
            stepper.stepOver(); // numbers[0] = 0 + 1;
            expect(context.numbers[0]).to.be(1);
            expect(context.numbers[1]).to.be(undefined);
            expect(context.numbers[2]).to.be(undefined);

            stepper.stepOver(); // numbers[1] = 1 + 1;
            expect(context.numbers[0]).to.be(1);
            expect(context.numbers[1]).to.be(2);
            expect(context.numbers[2]).to.be(undefined);

            stepper.stepOver(); // numbers[2] = 2 + 1;
            expect(context.numbers[0]).to.be(1);
            expect(context.numbers[1]).to.be(2);
            expect(context.numbers[2]).to.be(3);

            stepper.stepOver();

            expect(stepper.stopped).to.be(true);
        });

        describe("Functions", function () {
            var code;

            it("should run all commands in a function", function () {
                code = getFunctionBody(function () {
                    var foo = function () {
                        fill(255,0,0);
                        rect(50,50,100,100);
                    };
                    foo();
                });

                stepper = stepperWithCode(code);

                stepper.stepOver();
                stepper.stepOver();
                stepper.stepOver();

                expect(context.fill.calledWith(255,0,0)).to.be(true);
                expect(context.rect.calledWith(50,50,100,100)).to.be(true);
            });

            it("should return the correct line numbers", function () {
                code = getFunctionBody(function () {
                    var foo = function () {
                        fill(255,0,0);
                        rect(50,50,100,100);
                    };
                    foo();
                });

                stepper = stepperWithCode(code);

                stepper.stepOver();
                expect(stepper.line).to.be(1);
                stepper.stepOver();
                expect(stepper.line).to.be(5);
                stepper.stepOver();
                expect(stepper.line).to.be(-1);
                expect(stepper.stopped).to.be(true);
            });

            it("should return the correct line numbers with loops", function () {
                code = getFunctionBody(function () {
                    for (var i = 0; i < 3; i++) {
                        rect(i * 100, 100, 50, 50);
                    }
                });

                stepper = stepperWithCode(code);

                stepper.stepOver();
                expect(stepper.line).to.be(1);
                stepper.stepOver();
                expect(stepper.line).to.be(2);
                stepper.stepOver();
                expect(stepper.line).to.be(2);
                stepper.stepOver();
                expect(stepper.line).to.be(2);
                stepper.stepOver();
                expect(stepper.stopped).to.be(true);
            });

            it("should handle nested function calls", function () {
                code = getFunctionBody(function () {
                    var foo = function () {
                        fill(255,0,0);
                        rect(50,50,100,100);
                    };
                    var bar = function () {
                        fill(0,255,255);
                        foo();
                        rect(200,200,100,100);
                    };
                    bar();
                });

                stepper = stepperWithCode(code);

                stepper.stepOver();
                stepper.stepOver();
                stepper.stepOver();
                stepper.stepOver();

                expect(context.fill.calledWith(0,255,255)).to.be(true);
                expect(context.rect.calledWith(200,200,100,100)).to.be(true);
                expect(context.fill.calledWith(255,0,0)).to.be(true);
                expect(context.rect.calledWith(50,50,100,100)).to.be(true);
            });

            it("should handle functions with return values", function () {
                code = getFunctionBody(function () {
                    var foo = function () {
                        return 5;
                    };
                    x = foo();
                });

                stepper = stepperWithCode(code);

                stepper.stepOver();
                stepper.stepOver();
                stepper.stepOver();
                stepper.stepOver();

                expect(context.x).to.be(5);
            });

            it("should handle nested function calls in the same expression", function () {
                code = getFunctionBody(function () {
                    var add = function (x,y) {
                        return x + y;
                    };
                    print(add(add(1,2),add(3,4)));
                });

                stepper = stepperWithCode(code);

                stepper.stepOver(); // initial step
                stepper.stepOver(); // var add = ...
                stepper.stepOver(); // add(1,2)
                stepper.stepOver(); // add(3,4)
                stepper.stepOver(); // add(3,7)
                stepper.stepOver(); // print(10)

                expect(context.print.calledWith(10)).to.be(true);
            });

            it("should hanlde stepping over user defined functions containing non-instrumented function calls", function () {
                var code = getFunctionBody(function () {
                    var quadRoot = function (x) {
                        return Math.sqrt(Math.sqrt(x));
                    };
                    x = quadRoot(16);
                });

                stepper = stepperWithCode(code);

                stepper.stepOver();
                stepper.stepOver();
                stepper.stepOver();

                expect(context.x).to.be(2);
            });
        });
    });

    describe("stepIn", function () {
        it("should return the current line number", function () {
            var code = getFunctionBody(function () {
                fill(255,0,0);
                x = 5;
                y = 10;
            });

            stepper = stepperWithCode(code);
            stepper.stepIn();
            expect(stepper.line).to.be(1);   // line numbers start at 1
        });

        it("should call run each step one at a time", function () {
            stepper = stepperWithCode("fill(255,0,0);x=5;y=10;");

            stepper.stepIn(); // prime the stepper

            stepper.stepIn();
            expect(context.fill.calledWith(255,0,0)).to.be(true);
            expect(context.x).to.equal(0);
            expect(context.y).to.equal(0);

            stepper.stepIn();
            expect(context.x).to.equal(5);
            expect(context.y).to.equal(0);

            stepper.stepIn();
            expect(context.y).to.equal(10);
        });

        it("should step through loops", function () {
            stepper = stepperWithCode("for(var i=0;i<3;i++){numbers[i]=i+1;}");

            stepper.stepOver(); // prime the stepper

            stepper.stepOver(); // for
            stepper.stepOver(); // numbers[0] = 0 + 1;
            expect(context.numbers[0]).to.be(1);
            expect(context.numbers[1]).to.be(undefined);
            expect(context.numbers[2]).to.be(undefined);

            stepper.stepOver(); // numbers[1] = 1 + 1;
            expect(context.numbers[0]).to.be(1);
            expect(context.numbers[1]).to.be(2);
            expect(context.numbers[2]).to.be(undefined);

            stepper.stepOver(); // numbers[2] = 2 + 1;
            expect(context.numbers[0]).to.be(1);
            expect(context.numbers[1]).to.be(2);
            expect(context.numbers[2]).to.be(3);

            stepper.stepOver();

            expect(stepper.stopped).to.be(true);
        });

        describe("Functions", function () {
            var code;

            it("should run only the commands it's stepped to so-far", function () {
                code = getFunctionBody(function () {
                    var foo = function () {
                        fill(255,0,0);
                        rect(50,50,100,100);
                    };
                    foo();
                });

                stepper = stepperWithCode(code);

                stepper.stepIn();
                stepper.stepIn();
                stepper.stepIn();
                stepper.stepIn();

                expect(context.fill.calledWith(255,0,0)).to.be(true);
                expect(context.rect.calledWith(50,50,100,100)).to.be(false);
            });

            it("should return the correct line numbers", function () {
                code = getFunctionBody(function () {
                    var foo = function () {
                        fill(255,0,0);
                        rect(50,50,100,100);
                    };
                    foo();
                });

                stepper = stepperWithCode(code);

                var lineNumbers = [1,5,2,3,5];
                lineNumbers.forEach(function (line) {
                    stepper.stepIn();
                    expect(stepper.line).to.be(line);
                });
                stepper.stepIn();

                expect(stepper.stopped).to.be(true);
            });

            it("should handle nested function calls", function () {
                code = getFunctionBody(function () {
                    var foo = function() {
                        fill(255,0,0);
                        rect(50,50,100,100);
                    };
                    var bar = function() {
                        fill(0, 255, 255);
                        foo();
                        rect(200, 200, 100, 100);
                    };
                    bar();
                });

                stepper = stepperWithCode(code);

                stepper.stepOver();
                stepper.stepOver();
                stepper.stepOver();
                stepper.stepIn();
                stepper.stepOver();
                stepper.stepIn();
                stepper.stepOver();

                expect(context.fill.calledWith(0,255,255)).to.be(true);
                expect(context.fill.calledWith(255,0,0)).to.be(true);

                // these are false because they haven't been reached yet
                expect(context.rect.calledWith(200,200,100,100)).to.be(false);
                expect(context.rect.calledWith(50,50,100,100)).to.be(false);
            });

            it("should return the correct line numbers with nested function calls", function () {
                code = getFunctionBody(function () {
                    var foo = function() {
                        fill(255,0,0);
                        rect(50,50,100,100);
                    };
                    var bar = function() {
                        fill(0, 255, 255);
                        foo();
                        rect(200, 200, 100, 100);
                    };
                    bar();
                });

                stepper = stepperWithCode(code);

                var lineNumbers = [1,5,10,6,7,2,3,7,8,10];
                lineNumbers.forEach(function (line) {
                    stepper.stepIn();
                    expect(stepper.line).to.be(line);
                });
                stepper.stepIn();
                expect(stepper.stopped).to.be(true);
            });

            it("should handle nested function calls in the same expression", function () {
                code = getFunctionBody(function () {
                    var add = function (x,y) {
                        return x + y;
                    };
                    print(add(add(1,2),add(3,4)));
                });

                stepper = stepperWithCode(code);

                stepper.stepIn();
                expect(stepper.line).to.be(1);
                stepper.stepIn();
                expect(stepper.line).to.be(4);
                stepper.stepIn();
                expect(stepper.line).to.be(2);  // add(1,2)
                stepper.stepIn();
                expect(stepper.line).to.be(4);
                stepper.stepIn();
                expect(stepper.line).to.be(2);  // add(3,4)
                stepper.stepIn();
                expect(stepper.line).to.be(4);
                stepper.stepIn();
                expect(stepper.line).to.be(2);  // add(3,7)
                stepper.stepIn();
                expect(stepper.line).to.be(4);  // print(10)
                stepper.stepIn();

                expect(context.print.calledWith(10)).to.be(true);
            });

            it("should handle nested function calls to non-instrument functions", function () {
                var code = getFunctionBody(function () {
                    x = Math.sqrt(Math.sqrt(16));
                });

                stepper = stepperWithCode(code);
                stepper.start();

                expect(context.x).to.be(2);
            });
        });
    });

    describe("stepOut", function () {
        var code;

        beforeEach(function () {
            code = getFunctionBody(function () {
                var foo = function() {
                    fill(255,0,0);
                    rect(50,50,100,100);
                };
                var bar = function() {
                    fill(0,255,255);
                    foo();
                    rect(200,200,100,100);
                };
            });
        });

        it("should run to the end of the scope after stepping in", function () {
            code += "foo();";
            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver();
            stepper.stepIn();   // foo();
            expect(context.fill.calledWith(255,0,0)).to.be(false);
            expect(context.rect.calledWith(50,50,100,100)).to.be(false);

            stepper.stepOut();
            expect(context.fill.calledWith(255,0,0)).to.be(true);
            expect(context.rect.calledWith(50,50,100,100)).to.be(true);
        });

        it("should return the correct line numbers", function () {
            code += "foo();\nrect(0,0,10,10);";
            stepper = stepperWithCode(code);

            stepper.stepOver(); // prime the stepper
            stepper.stepOver();
            stepper.stepOver();

            stepper.stepIn();
            expect(stepper.line).to.be(2); // for();
            stepper.stepOut();
            expect(stepper.line).to.be(10);
            stepper.stepOver();
            expect(stepper.line).to.be(11);
            stepper.stepOut();
            expect(stepper.stopped).to.be(true);
        });

        it("should handle nested function calls", function () {
            code += "bar();";
            stepper = stepperWithCode(code);

            stepper.stepOver(); // prime the stepper
            stepper.stepOver();
            stepper.stepOver();
            stepper.stepIn();   // bar();
            stepper.stepOver();
            stepper.stepIn();   // foo();

            expect(context.fill.calledWith(0,255,255)).to.be(true);
            expect(context.fill.calledWith(255,0,0)).to.be(false);
            expect(context.rect.calledWith(50,50,100,100)).to.be(false);
            expect(context.rect.calledWith(200,200,100,100)).to.be(false);

            stepper.stepOut();
            expect(context.fill.calledWith(0,255,255)).to.be(true);
            expect(context.fill.calledWith(255,0,0)).to.be(true);
            expect(context.rect.calledWith(50,50,100,100)).to.be(true);
            expect(context.rect.calledWith(200,200,100,100)).to.be(false);

            stepper.stepOut();
            expect(context.fill.calledWith(0,255,255)).to.be(true);
            expect(context.fill.calledWith(255,0,0)).to.be(true);
            expect(context.rect.calledWith(50,50,100,100)).to.be(true);
            expect(context.rect.calledWith(200,200,100,100)).to.be(true);
        });

        it("should return the correct line numbers with nested functions", function () {
            code += "bar();\nrect(0,0,10,10);";
            stepper = stepperWithCode(code);

            stepper.stepOver(); // prime the stepper
            stepper.stepOver();
            stepper.stepOver();
            stepper.stepIn();   // foo();
            stepper.stepOver();
            stepper.stepIn();   // foo();

            stepper.stepOut();
            expect(stepper.line).to.be(7);
            stepper.stepOut();
            expect(stepper.line).to.be(10);
            stepper.stepOut();
            expect(stepper.stopped).to.be(true);
        });
    });

    describe("Objects", function () {
        it("should work with user defined constructors", function () {
            var code = getFunctionBody(function () {
                function Point(x,y) {
                    this.x = x;
                    this.y = y;

                    console.log("end of new Point");
                }
                p = new Point(5,10);
            });

            stepper = stepperWithCode(code);

            stepper.start();

            expect(context.p.x).to.be(5);
            expect(context.p.y).to.be(10);
        });

        it("should work with non-instrumented constructors", function () {
            var code = getFunctionBody(function () {
                p = new Vector(5,10);
            });

            stepper = stepperWithCode(code);

            stepper.start();

            expect(context.p.x).to.be(5);
            expect(context.p.y).to.be(10);
        });

        it("should work with functional expression constructors", function () {
            var code = getFunctionBody(function () {
                var Point = function (x,y) {
                    this.x = x;
                    this.y = y;
                };
                p = new Point(5,10);
            });

            stepper = stepperWithCode(code);

            stepper.start();

            expect(context.p.x).to.be(5);
            expect(context.p.y).to.be(10);
        });

        it("should step into constructors", function () {
            var code = getFunctionBody(function () {
                var Point = function (x,y) {
                    this.x = x;
                    this.y = y;
                };
                p = new Point(5,10);
            });

            stepper = stepperWithCode(code);

            stepper.stepIn();
            expect(stepper.line).to.be(1);
            stepper.stepIn();
            expect(stepper.line).to.be(5);
            stepper.stepIn();
            expect(stepper.line).to.be(2);
            stepper.stepIn();
            expect(stepper.line).to.be(3);
            stepper.stepIn();
            expect(stepper.line).to.be(5);
            stepper.stepIn();
            expect(stepper.stopped).to.be(true);

            expect(context.p.x).to.be(5);
            expect(context.p.y).to.be(10);
        });

        it("should work with calling methods on object literals", function () {
            var code = getFunctionBody(function () {
                var obj = {
                    foo: function () {
                        fill(255,0,0);
                        rect(50,50,100,100);
                    },
                    bar: function () {
                        fill(0,255,255);
                        this.foo();
                        rect(200,200,100,100);
                    }
                };
                obj.bar();
            });

            stepper = stepperWithCode(code);

            stepper.start();

            expect(context.fill.calledWith(0,255,255)).to.be(true);
            expect(context.fill.calledWith(255,0,0)).to.be(true);
            expect(context.rect.calledWith(50,50,100,100)).to.be(true);
            expect(context.rect.calledWith(200,200,100,100)).to.be(true);
        });

        it("shouldn't wrap globals", function () {
            var code = getFunctionBody(function () {
                x = Math.sqrt(4);
            });

            stepper = stepperWithCode(code);

            stepper.start();

            expect(context.x).to.be(2);
        });

        it("should be able to step over new expresssions", function () {
            var code = getFunctionBody(function () {
                function Point(x,y) {
                    this.x = x;
                    this.y = y;
                }
                p = new Point(5,10);
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver();
            stepper.stepOver();

            expect(context.p.x).to.be(5);
            expect(context.p.y).to.be(10);
        });

        it("should be able to step out of a new expression", function () {
            var code = getFunctionBody(function () {
                function Point(x,y) {
                    this.x = x;
                    this.y = y;
                }
                p = new Point(5,10);
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            expect(stepper.line).to.be(1);
            stepper.stepOver();
            expect(stepper.line).to.be(5);
            stepper.stepIn();
            expect(stepper.line).to.be(2);
            stepper.stepOut()
            expect(stepper.line).to.be(5);
            stepper.stepOver();
            expect(stepper.stopped).to.be(true);

            expect(context.p.x).to.be(5);
            expect(context.p.y).to.be(10);
        });

        it("should handle defining methods this", function () {
            var code = getFunctionBody(function () {
                var Point = function(x,y) {
                    this.x = x;
                    this.y = y;
                    this.dist = function () {
                        return Math.sqrt(this.x * this.x + this.y * this.y);
                    };
                };
                var p = new Point(3,4);
                x = p.dist();
            });

            stepper = stepperWithCode(code);

            stepper.start();

            expect(context.x).to.be(5);
        });

        it("should handle defining methods on the prototype", function () {
            var code = getFunctionBody(function () {
                var Point = function(x,y) {
                    this.x = x;
                    this.y = y;
                };
                Point.prototype.dist = function () {
                    return Math.sqrt(this.x * this.x + this.y * this.y);
                };
                var p = new Point(3,4);
                x = p.dist();
            });

            stepper = stepperWithCode(code);

            stepper.start();

            expect(context.x).to.be(5);
        });

        it("should handle calling methods on chained member expressions", function () {
            var code = getFunctionBody(function () {
                var Point = function(x,y) {
                    this.x = x;
                    this.y = y;
                };
                Point.prototype.dist = function () {
                    return Math.sqrt(this.x * this.x + this.y * this.y);
                };
                var circle = {
                    center: new Point(3,4),
                    radius: 1
                };
                x = circle.center.dist();
            });

            stepper = stepperWithCode(code);

            stepper.start();

            expect(context.x).to.be(5);
        });
    });

    describe("Breakpoints", function () {
        beforeEach(function () {
            var code = getFunctionBody(function () {
                fill(255,0,0);
                rect(100,100,300,200);
                x = 5;
                y = 10;
                fill(0,255,255);
                rect(x,y,100,100);
            });

            stepper = stepperWithCode(code);
        });

        it("should pause on the correct lines", function () {
            stepper.setBreakpoint(3);
            stepper.start();
            expect(stepper.line).to.be(3);
            expect(context.x).to.be(0);
            stepper.stepOver();
            expect(context.x).to.be(5);
        });

        it("should run after after hitting a breakpoint", function () {
            stepper.setBreakpoint(3);
            stepper.start();
            expect(stepper.line).to.be(3);
            stepper.start();
            expect(context.rect.callCount).to.be(2);
        });

        it("should hit a breakpoint after hitting a breakpoint", function () {
            stepper.setBreakpoint(2);
            stepper.setBreakpoint(4);
            stepper.start();
            expect(stepper.line).to.be(2);
            stepper.resume();
            expect(stepper.line).to.be(4);
            expect(context.y).to.be(0);
            stepper.stepOver();
            expect(context.y).to.be(10);
        });

        it("should set breakpoints when paused", function () {
            stepper.setBreakpoint(2);
            stepper.start();
            stepper.setBreakpoint(4);
            stepper.start();
            expect(context.y).to.be(0);
            stepper.stepOver();
            expect(context.y).to.be(10);
        });

        it("should clear breakpoints when paused", function () {
            stepper.setBreakpoint(2);
            stepper.setBreakpoint(4);
            stepper.start();
            stepper.clearBreakpoint(4);
            stepper.start();
            expect(context.rect.callCount).to.be(2);
        });

        describe("Functions", function () {
            beforeEach(function () {
                var code = getFunctionBody(function () {
                    var foo = function () {
                        fill(255,0,0);
                        rect(100,100,300,200);
                    };
                    foo();
                });

                stepper = stepperWithCode(code);
            });

            it("should break inside functions", function () {
                stepper.setBreakpoint(3);
                stepper.start();
                expect(context.fill.calledWith(255,0,0)).to.be(true);
                expect(context.rect.callCount).to.be(0);
                stepper.start();
                expect(context.rect.calledWith(100,100,300,200)).to.be(true);
            });

            it("shouldn't hit a breakpoint one a function call when calling 'run' from inside", function () {
                var code = getFunctionBody(function () {
                    var foo = function () {
                        fill(255,0,0);
                        rect(100,100,300,200);
                    };
                    foo();
                    fill(0,255,255);
                    rect(200,200,50,50);
                });

                stepper = stepperWithCode(code);

                stepper.setBreakpoint(5);

                stepper.start();
                expect(context.fill.callCount).to.be(0);

                stepper.stepIn();
                stepper.stepOver();
                expect(context.fill.callCount).to.be(1);

                stepper.start();
                expect(stepper.stopped).to.be(true);
                expect(context.fill.callCount).to.be(2);
                expect(context.rect.callCount).to.be(2);
            });
        });
    });

    describe("Scopes and Context", function () {
        it("should update the values of in scope variables", function () {
            var code = getFunctionBody(function () {
                var dist = function (x1, y1, x2, y2) {
                    var dx, dy, d_sq;
                    dx = x2 - x1;
                    dy = y2 - y1;
                    d_sq = dx * dx + dy * dy;
                    return Math.sqrt(d_sq);
                };
                print(dist(8, 5, 4, 2));
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver();
            stepper.stepIn();
            stepper.stepOver();

            var scope = stepper.stack.peek().scope;
            expect(scope.x1).to.be(8);
            expect(scope.y1).to.be(5);
            expect(scope.x2).to.be(4);
            expect(scope.y2).to.be(2);

            expect(scope.dx).to.be(undefined);
            expect(scope.dy).to.be(undefined);
            expect(scope.d_sq).to.be(undefined);

            stepper.stepOver();
            expect(scope.dx).to.be(-4);

            stepper.stepOver();
            expect(scope.dy).to.be(-3);

            stepper.stepOver();
            expect(scope.d_sq).to.be(25);

            stepper.stepOut();
            stepper.stepOut();

            expect(context.print.calledWith(5)).to.be(true);
        });

        it("should update variables in the root scope", function () {
            var code = getFunctionBody(function () {
                var a, b, c;
                a = 5;
                b = 10;
                c = a + b;
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver();
            var scope = stepper.stack.peek().scope;
            expect(scope.a).to.be(undefined);
            expect(scope.b).to.be(undefined);
            expect(scope.c).to.be(undefined);

            stepper.stepOver();
            expect(scope.a).to.be(5);

            stepper.stepOver();
            expect(scope.b).to.be(10);

            stepper.stepOver();
            expect(scope.c).to.be(15);
        });

        it("should not include variables from the context in the root scope", function () {
            var code = getFunctionBody(function () {
                var x, y, a, b;
                x = 5;
                y = 10;
                a = x;
                b = y;
            });

            stepper = stepperWithCode(code);
            stepper.stepOver();

            var scope = stepper.stack.peek().scope;
            expect(scope.a).to.be(undefined);
            expect(scope.b).to.be(undefined);
            expect(scope.hasOwnProperty("x")).to.be(false);
            expect(scope.hasOwnProperty("y")).to.be(false);

            stepper.start();
            expect(context.x).to.be(5);
            expect(context.y).to.be(10);

            expect(scope.a).to.be(5);
            expect(scope.b).to.be(10);
        });

        it("should allow you to redeclare variables in context and have them still be accessible", function () {
            var code = getFunctionBody(function () {
                var x = 5;
                var y = 10;
            });

            stepper = stepperWithCode(code);
            stepper.start();

            expect(context.x).to.be(5);
            expect(context.y).to.be(10);
        });
    });

    // all function calls are treated as ambiguous by _createDebugGenerator
    // the stepper resolves whether the function being called returns a
    // generator or not
    describe("Ambiguous method calls", function () {
        // Sometimes it's not possible to tell if a method call is to a built-in
        // function that we can't step into or if it's been properly converted
        // to a generate because it is a user-defined function.  These tests
        // make sure that we can handle these cases.  Original test code taken
        // from live-editor/output/pjs/output_test.js

        it("Verify that toString() Works", function () {
            var code = getFunctionBody(function () {
                var num = 50;
                num = parseInt(num.toString(), 10);
            });

            stepper = stepperWithCode(code);

            stepper.start();
        });

        it("Verify that toString() Works with stepOver", function () {
            var code = getFunctionBody(function () {
                var num = 50;
                num = parseInt(num.toString(), 10);
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver();
            stepper.stepOver();
        });

        it("Verify that toString() works with stepOut", function () {
            var code = getFunctionBody(function () {
                var foo = function () {
                    var num = 50;
                    num = parseInt(num.toString(), 10);
                };
                foo();
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            expect(stepper.line).to.be(1);
            stepper.stepOver();
            expect(stepper.line).to.be(5);
            stepper.stepIn();
            expect(stepper.line).to.be(2);
            stepper.stepOut();
        });
    });

    describe("Functions returning functions", function () {
        it("should run a function returned by another function", function () {
            var code = getFunctionBody(function () {
                var foo = function () {
                    return function () {
                        x = 5;
                    };
                };
                var bar = foo();
                bar();
            });

            stepper = stepperWithCode(code);

            stepper.start();

            expect(context.x).to.be(5);
        });

        it("should step into a function returned by another function", function () {
            var code = getFunctionBody(function () {
                var foo = function () {
                    return function () {
                        x = 5;
                    };
                };
                var bar = foo();
                bar();
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver();
            stepper.stepOver();
            stepper.stepIn();
            expect(stepper.line).to.be(3);
            stepper.stepOut();
        });

        it("should be able to call a returned function immediately", function () {
            var code = getFunctionBody(function () {
                var foo = function () {
                    return function () {
                        x = 5;
                    };
                };
                foo()();
            });

            stepper = stepperWithCode(code);

            stepper.start();

            expect(context.x).to.be(5);
        });

        it("should be able to step into a returned function immediately", function () {
            var code = getFunctionBody(function () {
                var foo = function () {
                    return function () {
                        x = 5;
                    };
                };
                foo()();
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver();
            stepper.stepIn();
            expect(stepper.line).to.be(2);
            stepper.stepOut();
            expect(stepper.line).to.be(6);
            stepper.stepIn();
            expect(stepper.line).to.be(3);
            stepper.stepOut();
        });

        it("should be able to call a method that returns a function", function () {
            var code = getFunctionBody(function () {
                var obj = {
                    foo: function () {
                        return function () {
                            x = 5;
                        };
                    }
                };
                obj.foo()();
            });

            stepper = stepperWithCode(code);

            stepper.start();

            expect(context.x).to.be(5);
        });
    });

    describe("calling functions in various places", function () {
        describe("var declarations", function () {
            it("should step into var x = foo()", function () {
                var code = getFunctionBody(function (){
                    var foo = function () {
                        print("foo");
                    };
                    var x = foo();
                });

                stepper = stepperWithCode(code);
                stepper.stepOver();
                stepper.stepOver();
                expect(stepper.line).to.be(4);
                stepper.stepOver();
                expect(stepper.stopped).to.be(true);
            });

            it("should step over var x = foo()", function () {
                var code = getFunctionBody(function (){
                    var foo = function () {
                        print("foo");
                    };
                    var bar = function () {
                        print("bar");
                    };
                    var x = foo();
                    var y = foo();
                });

                stepper = stepperWithCode(code);
                stepper.stepOver();
                stepper.stepOver();
                stepper.stepOver();
                expect(stepper.line).to.be(7);
                stepper.stepOver();
                expect(stepper.line).to.be(8);
                stepper.stepOver();
                expect(stepper.stopped).to.be(true);
            });

            it("should step over var x = foo(), y = bar()", function () {
                var code = getFunctionBody(function (){
                    var foo = function () {
                        print("foo");
                    };
                    var bar = function () {
                        print("bar");
                    };
                    var x = foo(), y = foo();
                });

                stepper = stepperWithCode(code);
                stepper.stepOver();
                stepper.stepOver();
                stepper.stepOver();
                expect(stepper.line).to.be(7);
                stepper.stepOver();
                expect(stepper.line).to.be(7);
                stepper.stepOver();
                expect(stepper.stopped).to.be(true);
            });
        });

        describe("for loops", function () {

        });
    });

    describe("Functions", function () {
        it("should work with empty functions", function () {
            var code = getFunctionBody(function () {
                function foo(x,y) {}
                foo(x,y);
            });

            stepper = stepperWithCode(code);

            stepper.start();
        });
    });

    describe("Call Stack", function () {

        it("should work with anonymous object literals", function () {
            var code = getFunctionBody(function () {
                function bar(obj) {
                    obj.foo();
                }
                bar({
                    foo: function () {
                        x = 5;
                    }
                });
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver();
            stepper.stepIn();
            stepper.stepIn();

            expect(stepper.line).to.be(6);
            expect(stepper.stack.peek().name).to.be("<anonymous>.foo");

            stepper.start();

            expect(context.x).to.be(5);
        });

        it("should work with anonymous functions", function () {
            var code = getFunctionBody(function () {
                function bar(callback) {
                    callback();
                }
                bar(function () {
                    x = 5;
                });
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver();
            stepper.stepIn();
            stepper.stepIn();

            expect(stepper.line).to.be(5);
            expect(stepper.stack.peek().name).to.be("<anonymous>");

            stepper.start();

            expect(context.x).to.be(5);
        });

        it("should work with object literals (variable declaration)", function () {
            var code = getFunctionBody(function () {
                var obj = {
                    foo: {
                        bar: function () {
                            x = 5;
                        }
                    }
                };
                obj.foo.bar();
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver();
            stepper.stepIn();

            expect(stepper.line).to.be(4);
            expect(stepper.stack.peek().name).to.be("obj.foo.bar");

            stepper.start();

            expect(context.x).to.be(5);
        });

        it("should work with object literals (assignment expression)", function () {
            var code = getFunctionBody(function () {
                var obj;
                obj = {
                    foo: {
                        bar: function () {
                            x = 5;
                        }
                    }
                };
                obj.foo.bar();
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver();
            stepper.stepOver();
            stepper.stepIn();

            expect(stepper.line).to.be(5);
            expect(stepper.stack.peek().name).to.be("obj.foo.bar");

            stepper.start();

            expect(context.x).to.be(5);
        });

        it("should work with methods defined on the prototype (function declaration)", function () {
            var code = getFunctionBody(function () {
                function Foo () {}
                Foo.prototype.bar = function () {
                    x = 5;
                };
                var foo = new Foo();
                foo.bar();
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver();
            stepper.stepOver();
            stepper.stepOver();
            stepper.stepIn();

            expect(stepper.line).to.be(3);
            expect(stepper.stack.peek().name).to.be("Foo.prototype.bar");

            stepper.start();

            expect(context.x).to.be(5);
        });

        it("should work with methods defined on the prototype (function expression)", function () {
            var code = getFunctionBody(function () {
                var Foo = function () {};
                Foo.prototype.bar = function () {
                    x = 5;
                };
                var foo = new Foo();
                foo.bar();
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver();
            stepper.stepOver();
            stepper.stepOver();
            stepper.stepIn();

            expect(stepper.line).to.be(3);
            expect(stepper.stack.peek().name).to.be("Foo.prototype.bar");

            stepper.start();

            expect(context.x).to.be(5);
        });

        it("should work with methods defined on 'this'", function () {
            var code = getFunctionBody(function () {
                var Foo = function() {
                    this.bar = function () {
                        x = 5;
                    }
                };
                var foo = new Foo();
                foo.bar();
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver();
            stepper.stepOver();
            stepper.stepIn();

            expect(stepper.line).to.be(3);
            // TODO: fix this so that it says Foo.prototype.bar
            expect(stepper.stack.peek().name).to.be("this.bar");

            stepper.start();

            expect(context.x).to.be(5);
        });

        // TODO: fix the stepper so that this test case passes
        it.skip("should work with methods defined on 'this' (function declaration constructor)", function () {
            var code = getFunctionBody(function () {
                function Foo() {
                    this.bar = function () {
                        x = 5;  // Foo is hoisted outside of the "with" statement which cause x to refer to window.x
                    }
                }
                var foo = new Foo();
                foo.bar();
            });

            stepper = stepperWithCode(code);

            stepper.stepOver();
            stepper.stepOver();
            stepper.stepOver();
            stepper.stepIn();

            expect(stepper.line).to.be(3);
            // TODO: fix this so that it says Foo.prototype.bar
            expect(stepper.stack.peek().name).to.be("this.bar");

            stepper.start();

            expect(context.x).to.be(5);
        });
    });

    describe("lifecyle", function () {
        it("should call 'doneCallback' when complete", function (done) {
            var code = getFunctionBody(function () {
                fill(255,0,0);
                rect(100,200,50,50);
            });

            var breakpoints = {};

            stepper = stepperWithCode(
                code,
                breakpoints,
                function () {
                    // breakpointCallback
                },
                function () {
                    expect(stepper.stopped).to.be(true);
                    done();
                });

            stepper.start();
        });
    });
});
