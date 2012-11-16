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
var searchreplace = require("ext/searchreplace/searchreplace");
var c9console = require("ext/console/console");

var EMACS_ENABLED = false;
var IS_LOADING = false;
var IS_SEARCHING = false;
var previousPage = null;
var emacsHandler = null;

var markupSettings = function(){/*
<a:application xmlns:a="http://ajax.org/2005/aml">
    <a:checkbox position="9000" class="underlined" label="Emacs Mode" value="[editors/code/@emacsmode]" skin="checkbox_grey" onclick="require('ext/emacs/emacs').toggle()" />
</a:application>
*/}.toString().split(/\n/).slice(1,-1).join("\n");

exports.searchStore = {
    current: "",
    options: {
        needle: "",
        backwards: false,
        wrap: true,
        caseSensitive: false,
        wholeWord: false,
        regExp: false,
        start: null
    }
};

var addBindings = function(handler) {
    handler.addCommands({
        save : function(editor) {
            var page = tabEditors.getPage();
            if (!page)
                return;
            
            save.quicksave(null, function() {
                //c9console.log(page.name + " saved.\n");
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
//            c9console.log("INCREMENTAL<br />");
            var ed = code.amlEditor.$editor;
            var options = exports.searchStore;
            options.backwards = (dir === "backward");
            if (IS_SEARCHING) {
//                c9console.log("SEARCH: " + options.current + "<br />");
                var cur = ed.getCursorPosition();
                var options = exports.searchStore;
                options.start = null;
                ed.find(options.current, options);
//                ed.selection.setSelectionRange(ed.selection.getRange(), !options.backwards);
//                ed.find(options.current, options);
                ed.selection.setSelectionRange(ed.selection.getRange(), !options.backwards);
            }
            else {
//                c9console.log("SEARCH START<br />");
                IS_SEARCHING = true;
                options.current = "";
            }
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
            editor.on("emacsMode", emacsHandler.$statusListener);
            ide.dispatchEvent("track_action", {type: "emacs", action: "enable", mode: "normal"});
            require("ext/console/console").showInput();
        }
        else {
            if (IS_LOADING) return;
            IS_LOADING = true;
            
            _loadKeyboardHandler("ace/keyboard/emacs", function(module) {
                emacsHandler = module.handler;
                emacsHandler._handleKeyboard = emacsHandler.handleKeyboard;
                emacsHandler.handleKeyboard = function(data, hashId, key, keyCode) {
                    var _result = emacsHandler._handleKeyboard(data, hashId, key, keyCode);
                    if (IS_SEARCHING) {
                        var searchKeys = ["s", "r"];
                        var endKeys = ["up", "down", "left", "right", "home", "end", "pageup", "pagedown", "esc", "return"];
                        if ( (hashId > 0 && (key != "" && key != "\x00" && searchKeys.indexOf(key) == -1) || endKeys.indexOf(key) != -1)) {
                            IS_SEARCHING = false;
//                            c9console.log("SEARCH END<br />");
                        }
                        else if (hashId == 0) {
//                            c9console.log("KEY:" + key + "<br />");
                            var ed = code.amlEditor.$editor;
                            var cur = ed.getCursorPosition();
                            var options = exports.searchStore;
                            options.current += key;
                            options.start = {row: cur.row, column: cur.column-(options.backwards ? -1 : 1)};
//                            c9console.log("current search: " + options.current + "<br />");
                            ed.find(options.current, options);
                            ed.selection.setSelectionRange(ed.selection.getRange(), !options.backwards);

                            return {command:"null"};
                        }
                    }
                    else {
                        //
                    }
                    
                    return _result;
                };
                emacsHandler.$statusListener = function(mode) {
                    ide.dispatchEvent("emacs.changeMode", { mode : "mode" });
                };
                editor.setKeyboardHandler(emacsHandler);
                addBindings(emacsHandler);
                editor.on("emacsMode", emacsHandler.$statusListener);
                ide.dispatchEvent("track_action", {type: "emacs", action: "enable", mode: "normal"});
            })
        }
    });
};

var disableEmacs = function() {
    var editor = code.amlEditor.$editor;
    if (editor) {
        editor.keyBinding.removeKeyboardHandler(emacsHandler);
        editor.removeEventListener("emacsMode", emacsHandler.$statusListener);
    }
    ide.dispatchEvent("track_action", { type: "emacs", action: "disable" });
    EMACS_ENABLED = false;
};

module.exports = ext.register("ext/emacs/emacs", {
    name  : "Emacs mode",
    dev   : "tksnt.com",
    type  : ext.GENERAL,
    deps  : [editors, code, settings, extmgr, save, tabbehaviors, searchreplace],
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