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
