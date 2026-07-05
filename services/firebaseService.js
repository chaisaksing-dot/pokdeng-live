  const FirebaseService = {
  db: db,

  ref(path) {
    return this.db.ref(path);
  },

  update(data) {
    return this.db.ref().update(data);
  },

  set(path, value) {
    return this.db.ref(path).set(value);
  },

  remove(path) {
    return this.db.ref(path).remove();
  },

  once(path) {
    return this.db.ref(path).once("value");
  }
};