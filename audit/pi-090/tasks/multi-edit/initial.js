const store = {
    name: "alpha",
    count: 1,
    debug: false,
};

function info() {
    return store.name;
}

module.exports = { store, info };
