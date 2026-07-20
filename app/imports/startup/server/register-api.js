// Single place that imports every domain's method/collection/publication file so
// the server registers them at startup. Add ONE line here for each new domain
// under imports/api/<domain>/.

// Internal-DB domains (methods hit Mongo directly; also import the publications):
import '../../api/devices/devices.js';
import '../../api/devices/methods.js';
import '../../api/devices/publications.js';
import '../../api/messages/messages.js';
import '../../api/messages/methods.js';
import '../../api/messages/publications.js';
