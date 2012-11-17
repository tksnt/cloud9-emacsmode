define(function(require, exports, module) {
"use strict";

var ide = require("core/ide");
var ext = require("core/ext");
var editors = require("ext/editors/editors");
var code = require("ext/code/code");
var settings = require("ext/settings/settings");
var menus = require("ext/menus/menus");
var extmgr = require("ext/extmgr/extmgr");
var save = require("ext/save/save");
var tabbehaviors = require("ext/tabbehaviors/tabbehaviors");
var quicksearch = require("ext/quicksearch/quicksearch");
var Search = require("ace/search").Search;
var c9console = require("ext/console/console");

var DEBUG_MODE = false;
var EMACS_ENABLED = false;
var IS_LOADING    = false;
var IS_SEARCHING  = false;
var IS_KILLING    = false;

var aceEmacs = null;
var lastPosition = null;
var previousPage = null;
var emacsHandler = null;

var markupSettings = function(){/*
<a:application xmlns:a="http://ajax.org/2005/aml">
    <a:checkbox position="9000" class="underlined" label="Emacs Mode" value="[editors/code/@emacsmode]" skin="checkbox_grey" onclick="require('ext/emacs/emacs').toggle()" />
</a:application>
*/}.toString().split(/\n/).slice(1,-1).join("\n");

exports.searchStore = {
    markers: [],
    current: "",
    previous: "",
    options: {
        needle: "",
        backwards: false,
        wrap: true,
        caseSensitive: false,
        wholeWord: false,
        regExp: false,
        start: null,
        scope: Search.ALL
    }
};

var debug_log = function(text) {
    if (DEBUG_MODE)
        c9console.log(text + "<br/>");
};

var clearMarkers = function() {
    var ed = code.amlEditor.$editor;
    var options = exports.searchStore;
    options.markers.forEach(function(marker) {
        ed.session.removeMarker(marker);
    });
    options.markers = [];
};

var execFind = function(options) {
    var ed = code.amlEditor.$editor;
    clearMarkers();
    ed.find(options.current, options);
    ed.selection.setSelectionRange(ed.selection.getRange(), !options.backwards);
    options.start = null;
    ed.$search.set(options);
    var ranges = ed.$search.findAll(ed.getSession());
    ranges.forEach(function(range) {
        options.markers.push(ed.session.addMarker(range, "ace_bracket", "text"));
    });
    if (ranges.length === 0) {
        c9console.log("Failing I-search: " + options.current.replace(/\&/, "&amp;").replace(/</, "&lt;") + "<br />");
        setTimeout(function(){
            IS_SEARCHING = false;
            options.current = "";
        }, 500);
    }
};

var cancelAllModes = function() {
    IS_SEARCHING = false;
    clearMarkers();
    IS_KILLING = false;
};

var _mixin = function(source, mixins) {
    for (var key in mixins) {
        if (source[key])
            source[key + "_"] = source[key];
        
        source[key] = mixins[key];
    }
    return source;
};

var killRingMixin = {
    append : function(text) {
        this.$data[this.$data.length-1] += text;
    }
};

var handlerMixin = {
    movingKeys : ["up", "down", "left", "right", "home", "end", "pageup", "pagedown", "esc", "return"],
    
    isMovingKey : function(key) {
        return this.movingKeys.indexOf(key) != -1
    },
    
    isNoopKey : function(key) {
        return ["", "\x00"].indexOf(key) != -1;
    },
    
    handleKeyboard : function(data, hashId, key, keyCode) {
        debug_log("hashId:" + hashId + " key:"+key+" keyCode:"+keyCode+"<br/>");
        var editor = code.amlEditor.$editor;
        var ignoreKeys = [];
        if (IS_KILLING) {
            ignoreKeys = ["", "\x00", "k"];
            if ( ((hashId & (1|8|2)) && ignoreKeys.indexOf(key) == -1) || this.isMovingKey(key) ) {
                IS_KILLING = false;
            }
        }
        
        if (IS_SEARCHING) {
            ignoreKeys = ["", "\x00", "s", "r"];
            if ( ( hashId != -1 && (hashId & (1|8|2)) && ignoreKeys.indexOf(key) == -1 ) || this.isMovingKey(key) ) {
                debug_log("HASHID:"+hashId);
                IS_SEARCHING = false;
                clearMarkers();
                exports.searchStore.previous = exports.searchStore.current;
                exports.searchStore.current = "";
                debug_log("SEARCH END<br/>");
                if (hashId == 1 && key == "g") {
                    debug_log("CLEAR SEARCH TEXT<br/>");
                    if (lastPosition) {
                        debug_log("RESTORE POSITION<br/>");
                        debug_log("POS: " + JSON.stringify(lastPosition));
                        editor.clearSelection();
                        editor.moveCursorToPosition(lastPosition);
                        lastPosition = null;
                    }
                }
                else {
                    lastPosition = null;
                }
            }
            else if ( (hashId == -1) && !this.isNoopKey(key)) {
                debug_log("key:"+key+" code:"+keyCode);
                var cur = editor.getCursorPosition();
                var options = exports.searchStore;
                options.current += key;
                debug_log("SEARCHING: " + options.current + "<br/>");
                options.start = {row: cur.row, column: cur.column-(options.backwards ? -1 : 1)};
                execFind(options);

                return {command:"insertstring", args: "", passEvent:false};
            }
        }
        else {
            //
        }
        
        return this.handleKeyboard_(data, hashId, key, keyCode);
    },
    $statusListener : function(mode) {
        ide.dispatchEvent("emacs.changeMode", { mode : "mode" });
    }
};

var addBindings = function(handler) {
    handler.addCommands({
        save : function(editor) {
            var page = tabEditors.getPage();
            if (!page)
                return;
            
            save.quicksave(null, function() {
                //
            });
        },
        saveas : function(editor) {
            if (!tabEditors.getPage())
                return;
            
            save.saveas();
        },
        listEditors : function(editor) {
            //
        },
        prevEditor : function(editor) {
            var pages = tabEditors.getPages();
            if (!previousPage)
                return;
            
            var tabNum = pages.indexOf(previousPage);
            if (tabNum == -1)
                return;
            
            tabbehaviors.showTab(tabNum+1);
        },
        isearch : function(editor, dir) {
            var ed = code.amlEditor.$editor;
            var options = exports.searchStore;
            options.backwards = (dir === "backward");

            if (options.current != "")
                IS_SEARCHING = true;
            if (IS_SEARCHING) {
                debug_log("SEARCH<br/>");
                var options = exports.searchStore;
                options.start = null;
                if (options.current == "") options.current = options.previous;
                execFind(options);
            }
            else {
                debug_log("SEARCH START<br/>");
//                c9console.log("I-search:<br/>");
                lastPosition = ed.getCursorPosition();
                ed.selection.setSelectionRange(ed.selection.getRange(), !options.backwards);
                IS_SEARCHING = true;
            }
        },
        yank: function(editor) {
            editor.onPaste(aceEmacs.killRing.get());
            aceEmacs.killRing.$data.lastCommand = "yank";
        },
        killLine : function(editor) {
            editor.selection.selectLineEnd();
            var range = editor.getSelectionRange();
            if (range.isEmpty()) {
                editor.selection.selectRight();
                range = editor.getSelectionRange();
            }
            var text = editor.session.getTextRange(range);
            if (IS_KILLING) {
                aceEmacs.killRing.append(text);
            }
            else {
                IS_KILLING = true;
                aceEmacs.killRing.add(text);
            }
    
            editor.session.remove(range);
            editor.clearSelection();
        },
        noop: function(editor) {}
    });
    
    handler.bindKeys({
        "c-s" : {command: "isearch", args: "forward"},
        "c-r" : {command: "isearch", args: "backward"},
        "c-x s" : "save",
        "c-x c-s" : "save",
        "c-x c-w" : "saveas",
        "c-x c-b" : "listEditors",
        "c-x b" : "prevEditor",
        "c-space" : "complete"
    });
}

var _loadKeyboardHandler = function(path, callback) {
    var module;
    try {
        module = require(path);
    } catch (e) {};
    if (module)
        return callback(module);


    fetch(function() {
        require([path], callback);
    });

    function fetch(callback) {
        if (!ace.config.get("packaged"))
            return callback();

        var base = path.split("/").pop();
        var filename = ide.staticPrefix + "/ace/build/keybinding-" + base + ".js";
        var aceNetModule = "ace/lib/net";
        require(aceNetModule).loadScript(filename, callback);
    }
};

var _enableEmacs = function() {
    ext.initExtension(this);
    
    ide.addEventListener("init.ext/code/code", function(e){
        var editor = e.ext.amlEditor.$editor;
        EMACS_ENABLED = true;
        
        if (emacsHandler) {
            editor.setKeyboardHandler(emacsHandler);
            //editor.on("emacsMode", emacsHandler.$statusListener);
            ide.dispatchEvent("track_action", {type: "emacs", action: "enable", mode: "normal"});
            //require("ext/console/console").showInput();
        }
        else {
            if (IS_LOADING) return;
            IS_LOADING = true;
            
            _loadKeyboardHandler("ace/keyboard/emacs", function(module) {
                aceEmacs = module;
                _mixin(aceEmacs.killRing, killRingMixin);
                _mixin(aceEmacs.handler, handlerMixin);
                
                emacsHandler = aceEmacs.handler;
                editor.setKeyboardHandler(emacsHandler);
                addBindings(emacsHandler);
                //editor.on("emacsMode", emacsHandler.$statusListener);
                ide.dispatchEvent("track_action", {type: "emacs", action: "enable", mode: "normal"});
            });
            
            editor.on("click", cancelAllModes);
        }
    });
};

var _disableEmacs = function() {
    var editor = code.amlEditor.$editor;
    if (editor) {
        editor.keyBinding.removeKeyboardHandler(emacsHandler);
//        editor.removeEventListener("emacsMode", emacsHandler.$statusListener);
        editor.removeEventListener("click", cancelAllModes);
    }
    ide.dispatchEvent("track_action", { type: "emacs", action: "disable" });
    EMACS_ENABLED = false;
};

module.exports = ext.register("ext/emacs/emacs", {
    name  : "Emacs mode",
    dev   : "tksnt",
    type  : ext.GENERAL,
    deps  : [editors, code, settings, extmgr, save, tabbehaviors, quicksearch],
    nodes : [],
    alone : true,
    
    hook : function(){
        var self = this;
        var menuItem = new apf.item({
            type: "check",
            checked: "[{require('core/settings').model}::editors/code/@emacsmode]",
            onclick: function() { self.toggle(); }
        });

        menus.addItemByPath("View/Emacs Mode", menuItem, 150000);

        ide.addEventListener("settings.load", function(){
            settings.setDefaults("editors/code", [
                ["emacsmode", "false"]
            ]);
        });

        settings.addSettings("Code Editor", markupSettings);

        var tryEnabling = function () {
            if (settings.model) {
                var sholdEnable = apf.isTrue(settings.model.queryNode("editors/code").getAttribute("emacsmode"));
                if (EMACS_ENABLED == sholdEnable)
                    return;
                self.enable(sholdEnable === true);
            }
        };
        ide.addEventListener("init.ext/code/code", tryEnabling);
        ide.addEventListener("tab.beforeswitch", function(data) { previousPage = data.previousPage; } );
    },
    
    init : function(){
        //
    },
    
    toggle: function() {
        this.enable(EMACS_ENABLED === false);
        if (code.amlEditor) {
            code.amlEditor.focus();
        }
    },

    
    enable : function(doEnable){
        if (doEnable !== false) {
            _enableEmacs.call(this);
        }
        else {
            this.disable();
        }
    },

    disable : function(){
        _disableEmacs();
    },

    destroy : function(){
        this.nodes.each(function(item){
            item.destroy(true, true);
        });
        this.nodes = [];
    },
});

});