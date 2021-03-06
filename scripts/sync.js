Cu.import("resource://services-sync/engines.js");
Cu.import("resource://services-sync/record.js");
Cu.import("resource://services-sync/util.js");

function UserStyleRecord(collection, id) {
  CryptoWrapper.call(this, collection, id);
}

UserStyleRecord.prototype = {
  __proto__: CryptoWrapper.prototype,
  _logName: "Record.UserStyle",
};

Utils.deferGetSet(UserStyleRecord, "cleartext", ["id", "json", "code"]);

// Maintains the store of all your Foo-type items and their GUIDs.
function UserStylesStore(name) {
  Store.call(this, name);
}

UserStylesStore.prototype = {
  __proto__: Store.prototype,

  itemExists: function (id) {
    return mappedIndexForGUIDs[id] != null && mappedIndexForGUIDs[id] > -1;
  },

  createRecord: function(id, collection) {
    let record = new UserStyleRecord(collection, id);
    let index = mappedIndexForGUIDs[id];
    if (!index  || index < 0) {
      record.deleted = true;
      return record;
    }
    record.json = JSON.stringify(styleSheetList[index]);
    record.id = id;
    record.code = JSON.stringify(mappedCodeForIndex[index]);
    return record;
  },

  changeItemID: function(oldId, newId) {
    let index = mappedIndexForGUIDs[oldId];
    if (index != null && index > -1) {
      delete mappedIndexForGUIDs[oldId];
      mappedIndexForGUIDs[newId] = index;
      styleSheetList[index][9] = newId;
    }
  },

  getAllIDs: function() {
    let guids = {};
    mappedIndexForGUIDs = {};
    for (let index = 0; index < styleSheetList.length; index++) {
      if (styleSheetList[index][9] == null) {
        styleSheetList[index][9] = Utils.makeGUID();
      }
      guids[styleSheetList[index][9]] = true;
      mappedIndexForGUIDs[styleSheetList[index][9]] = index;
    }
    return guids;
  },

  wipe: function() {
    for (let guid in mappedIndexForGUIDs) {
      this.remove({id: guid});
    }
  },

  create: function(record) {
    this.update(record, true);
  },

  update: function(record, createNew) {
    let index = mappedIndexForGUIDs[record.id];
    if (createNew) {
      index = styleSheetList.length;
      if (JSON.parse(record.json)[9] == null) {
        let guid = Utils.makeGUID();
        let tempArray = JSON.parse(record.json);
        tempArray[9] = guid;
        record.json = JSON.stringify(tempArray);
        mappedIndexForGUIDs[guid] = index;
      }
      else {
        let guid = JSON.parse(record.json)[9];
        mappedIndexForGUIDs[guid] = index;
      }
    }
    if (index != null && index > -1) {
      styleSheetList[index] = JSON.parse(record.json);
      updateStyleCodeFromSync(index, JSON.parse(record.code));
      writeJSONPref();
    }
  },

  remove: function(record) {
    let index = mappedIndexForGUIDs[record.id];
    if (index != null && index > -1) {
      if (pref("keepDeletedOnSync")) {
        delete mappedIndexForGUIDs[record.id];
        styleSheetList[index][9] = Utils.makeGUID();
        mappedIndexForGUIDs[styleSheetList[index][9]] = index;
        return;
      }
      deleteStylesFromUSM([index]);
    }
  }
};

function UserStylesTracker(name) {
  Tracker.call(this, name);

  Svc.Obs.add("weave:engine:start-tracking", this);
  Svc.Obs.add("weave:engine:stop-tracking", this);
}

UserStylesTracker.prototype = {
  __proto__: Tracker.prototype,

  _enabled: false,
  observe: function observe(subject, topic, data) {
    switch (topic) {
      case "weave:engine:start-tracking":
        if (!this._enabled) {
          this._enabled = true;
        }
        break;

      case "weave:engine:stop-tracking":
        if (this._enabled) {
          this._enabled = false;
        }
        break;
    }
  },

  _add: function(guid) {
    if (this.addChangedID(guid) && pref("syncImmediately ")) {
      this.score += SCORE_INCREMENT_XLARGE;
    }
  },

  destroy: function() {
    Svc.Obs.remove("weave:engine:start-tracking", this);
    Svc.Obs.remove("weave:engine:stop-tracking", this);
  }
};

function UserStylesSyncEngine() {
  Weave.SyncEngine.call(this, "User Styles");
}

UserStylesSyncEngine.prototype = {
  __proto__: Weave.SyncEngine.prototype,
  _recordObj: UserStyleRecord,
  _storeObj: UserStylesStore,
  _trackerObj: UserStylesTracker,

  get trackerInstance() trackerInstance,

  destroy: function () {
    if (this.trackerInstance) this.trackerInstance.destroy();
  },
};
