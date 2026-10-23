const store = {
    name: "beta",
    count: 2,
    debug: true,
};

function info() {
    return store.name;
}

module.exports = { store, info };
