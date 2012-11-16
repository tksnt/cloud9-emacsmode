Cloud9 Emacs mode
=================

This extension activates ACE's emacs keybindings, and add some feature for Cloud9.

Additional Features
-------------------

+ Incremental Search in the current editor. (Ctrl-s, Ctrl-r)
+ Switch to previous opened tab. (Ctrl-x b)
+ Quicksave. (Ctrl-x s, Ctrl-x Ctrl-s)
+ Save as... (Ctrl-x Ctrl-w)

Changes
-------

+ `keyboard-quit` (Ctrl-g) cancels current incremental search.
+ `kill-line` (Ctrl-k) kills to the end of line.
+ Continuous `kill-line` appends killed text to the recent kill-ring item.
+ Ctrl-Space bind to `complete`.

Installation
------------

Open the `Tools/Extension Manager...` window in Cloud9, and enter following url:

    https://github.com/tksnt/cloud9-emacsmode/blob/master/emacs.js

Click add.

How to use
----------

Click the `View/Emacs Mode` to toggle emacs mode.
Or check `Emacs Mode` in the preference pane.

Bindings
--------

C: Ctrl, S: Shift, M: Meta

+ C-a : `move-beginning-of-line`
+ C-b : `backward-char`
+ C-e : `move-end-of-line`
+ C-f : `forward-char`
+ C-g : `keyboard-quit`
+ C-k : `kill-line`
+ C-l : `recenter`
+ C-n : `next-line`
+ C-o : `open-line`
+ C-p : `previous-line`
+ C-r : `isearch-backward`
+ C-s : `isearch-forward`
+ C-t : `transpose-chars`
+ C-u : `universal-argument`
+ C-v : `scroll-up`
+ C-w : `kill-region`
+ C-x : `Control-X-prefix`
+ C-y : `yank`
+ C-z : `undo`
+ C-x s : `save-buffer`
+ C-x u : `undo`
+ C-x C-s : `save-buffer`
+ C-x C-w : `write-file`
+ S-C-z : `redo`
+ M-w : `kill-ring-save`
+ M-v : `scroll-down`

TODO
----

+ Add `yank-pop`. (Meta-y)
+ Add `list-buffers`. (Ctrl-x Ctrl-b)
+ Add `set-mark-command`. (Ctrl-@)
+ Add `exchange-point-and-mark`. (Ctrl-x Ctrl-x)
+ Add `find-file`. (Ctrl-x Ctrl-f)
