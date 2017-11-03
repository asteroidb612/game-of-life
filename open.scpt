#!/usr/bin/osascript
if application "Google Chrome" is running then
	tell application "Google Chrome" to make new window
end if
tell application "Google Chrome"
	open location "http://localhost:3000"
	activate
end tell
if application "Google Chrome" is running then
	tell application "Google Chrome" to make new window
end if
tell application "Google Chrome"
	open location "http://localhost:3000"
	activate
end tell
tell application "Google Chrome"
	activate
	set the bounds of the first window to {0, 0, 800, 1200}
	set the bounds of the second window to {800, 0, 1600, 1200}
end tell
