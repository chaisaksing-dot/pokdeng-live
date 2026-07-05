const WalletService = {

    async getBalance(userId) {
        const snap = await FirebaseService.once("wallet/" + userId);
        return snap.exists() ? snap.val() : 0;
    },

    async setBalance(userId, amount) {
        return FirebaseService.set("wallet/" + userId, amount);
    },

    async addBalance(userId, amount) {
        const balance = await this.getBalance(userId);
        return this.setBalance(userId, balance + amount);
    },

    async removeBalance(userId, amount) {
        const balance = await this.getBalance(userId);

        if (balance < amount) {
            throw new Error("เครดิตไม่พอ");
        }

        return this.setBalance(userId, balance - amount);
    }

};