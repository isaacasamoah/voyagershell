import sys

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("GdkX11", "3.0")
from gi.repository import GdkX11, Gtk

window = Gtk.Window(title=sys.argv[1])
window.set_decorated(False)
window.connect("destroy", Gtk.main_quit)
window.show_all()
print(GdkX11.X11Window.get_xid(window.get_window()), flush=True)
Gtk.main()
