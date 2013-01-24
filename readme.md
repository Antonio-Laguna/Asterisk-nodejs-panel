JavaScript Operator Panel [JOP]
================================

As opposed to FOP [http://www.asternic.org / http://www.fop2.com/], JOP is meant to be a HTML/JS solution to see the
current Asterisk status in a Pannel.

It's built on top of node.js, socket.io and express.js

It has even live pannels per-client to show stats of calls in the current day or to select from another day.

*Note*: As our Asterisk build and dialplan are heavily customized, we are using curls from dialplan and routes through
express to perform actions but you could connect to the AMI and be able to capture events.
If you are interested, you could use some other Node - Asterisk modules

I would love to work with some Asterisk dev/admin to bring this as something you could deploy within your Asterisk basic
installation.