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

var lastPosition = null;
var previousPage = null;
var emacsHandler = null;
var killRing = null;

var markupSettings = function(){/*
<a:application xmlns:a="http://ajax.org/2005/aml">
    <a:checkbox position="9000" class="underlined" label="Emacs Mode" value="[editors/code/@emacsmode]" skin="checkbox_grey" onclick="require('ext/emacs/emacs').toggle()" />
</a:application>
*/}.toString().split(/\n/).slice(1,-1).join("\n");

exports.searchStore = {
    markers: [],
    current: "",
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
        IS_SEARCHING = false;
        options.current = "";
    }
};

var cancelAllModes = function() {
    IS_SEARCHING = false;
    clearMarkers();
    IS_KILLING = false;
};

var addBindings = function(handler) {
    killRing.append = function(text) {
        killRing.$data[killRing.$data.length - 1] += text;
    };
    
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
        incrementalsearch : function(editor, dir) {
            var ed = code.amlEditor.$editor;
            var options = exports.searchStore;
            options.backwards = (dir === "backward");

            if (options.current != "")
                IS_SEARCHING = true;
            if (IS_SEARCHING) {
                debug_log("SEARCH<br/>");
                var options = exports.searchStore;
                options.start = null;
                execFind(options);
            }
            else {
                debug_log("SEARCH START<br/>");
                lastPosition = ed.getCursorPosition();
                ed.selection.setSelectionRange(ed.selection.getRange(), !options.backwards);
                IS_SEARCHING = true;
            }
        },
        yank: function(editor) {
            editor.onPaste(killRing.get());
            killRing.$data.lastCommand = "yank";
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
                killRing.append(text);
            }
            else {
                IS_KILLING = true;
                killRing.add(text);
            }
    
            editor.session.remove(range);
            editor.clearSelection();
        }
    });
    
    handler.bindKeys({
        "c-s" : {command: "incrementalsearch", args: "forward"},
        "c-r" : {command: "incrementalsearch", args: "backward"},
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

var enableEmacs = function() {
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
                killRing = module.killRing;
                emacsHandler = module.handler;
                emacsHandler._handleKeyboard = emacsHandler.handleKeyboard;
                emacsHandler.handleKeyboard = function(data, hashId, key, keyCode) {
                    if (IS_KILLING) {
                        var ignoreKeys = ["", "\x00", "k"];
                        var endKeys = ["up", "down", "left", "right", "home", "end", "pageup", "pagedown", "esc", "return"];
                        if ( ((hashId & (1|8|2)) && ignoreKeys.indexOf(key) == -1) || endKeys.indexOf(key) != -1 ) {
                            IS_KILLING = false;
                        }
                    }
                    
                    if (IS_SEARCHING) {
                        var ignoreKeys = ["", "\x00", "s", "r"];
                        var endKeys = ["up", "down", "left", "right", "home", "end", "pageup", "pagedown", "esc", "return"];
                        
                        if ( ( (hashId & (1|8|2)) && ignoreKeys.indexOf(key) == -1 ) || endKeys.indexOf(key) != -1 ) {
                            IS_SEARCHING = false;
                            clearMarkers();
                            debug_log("SEARCH END<br/>");
                            if (hashId == 1 && key == "g") {
                                debug_log("CLEAR SEARCH TEXT<br/>");
                                exports.searchStore.current = "";
                                if (lastPosition) {
                                    debug_log("RESTORE POSITION<br/>");
                                    debug_log("POS: " + JSON.stringify(lastPosition));
                                    editor.clearSelection();
                                    editor.moveCursorToPosition(lastPosition);
                                    lastPosition = null;
                                }
                            }
                        }
                        else if ( (hashId == 0 || hashId == 4) && key != "" && key != "\x00") {
                            debug_log("KEY: " + key + "<br/>");
                            var cur = editor.getCursorPosition();
                            var options = exports.searchStore;
                            options.current += key;
                            debug_log("SEARCHING: " + options.current + "<br/>");
                            options.start = {row: cur.row, column: cur.column}; //-(options.backwards ? -1 : 1)};
                            execFind(options);

                            return {command:"null"};
                        }
                    }
                    else {
                        //
                    }
                    
                    return emacsHandler._handleKeyboard(data, hashId, key, keyCode);
                };
                emacsHandler.$statusListener = function(mode) {
                    ide.dispatchEvent("emacs.changeMode", { mode : "mode" });
                };
                editor.setKeyboardHandler(emacsHandler);
                addBindings(emacsHandler);
                //editor.on("emacsMode", emacsHandler.$statusListener);
                ide.dispatchEvent("track_action", {type: "emacs", action: "enable", mode: "normal"});
            });
            
            editor.on("click", cancelAllModes);
        }
    });
};

var disableEmacs = function() {
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
            enableEmacs.call(this);
        }
        else {
            this.disable();
        }
    },

    disable : function(){
        disableEmacs();
    },

    destroy : function(){
        this.nodes.each(function(item){
            item.destroy(true, true);
        });
        this.nodes = [];
    },
});

});