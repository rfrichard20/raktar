// Kulcs-érték tár (offline adatok, vázlatok, kimenő sor). A megvalósítás közös: web/kozos/idb.js.
// Közös originen a Terep is fut → saját adatbázisnév ('raktar') és localStorage-előtag ('raktar:').
import { createStore } from '../kozos/idb.js';

export const { get, set, del, keys } = createStore('raktar', 'raktar:');
