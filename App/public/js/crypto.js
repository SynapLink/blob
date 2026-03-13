// crypto.js

window.cryptoUtils = {
    // Convert string to ArrayBuffer
    str2ab: function(str) {
        return new TextEncoder().encode(str);
    },

    // Convert ArrayBuffer to string
    ab2str: function(buffer) {
        return new TextDecoder().decode(buffer);
    },

    // Derive a key from a password
    deriveKey: async function(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );

        return await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    },

    // Encrypt string using AES-GCM
    encryptText: async function(plaintext, password) {
        // Generate a random salt and IV
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const key = await this.deriveKey(password, salt);

        const encodedPlaintext = this.str2ab(plaintext);

        const ciphertextParams = {
            name: "AES-GCM",
            iv: iv
        };

        const encrypted = await window.crypto.subtle.encrypt(
            ciphertextParams,
            key,
            encodedPlaintext
        );

        // Combine salt, iv, and ciphertext into a single ArrayBuffer for serialization
        const combined = new Uint8Array(salt.byteLength + iv.byteLength + encrypted.byteLength);
        combined.set(salt, 0);
        combined.set(iv, salt.byteLength);
        combined.set(new Uint8Array(encrypted), salt.byteLength + iv.byteLength);

        // Convert the combined bytes to a Base64 string for easy storage
        return this.ab2base64(combined);
    },

    // Decrypt Base64 string using AES-GCM
    decryptText: async function(b64Data, password) {
        const combined = this.base642ab(b64Data);

        // Extract salt, iv, and ciphertext
        const salt = combined.slice(0, 16);
        const iv = combined.slice(16, 16 + 12);
        const ciphertext = combined.slice(16 + 12);

        const key = await this.deriveKey(password, salt);

        const decryptParams = {
            name: "AES-GCM",
            iv: iv
        };

        try {
            const decryptedBuffer = await window.crypto.subtle.decrypt(
                decryptParams,
                key,
                ciphertext
            );
            return this.ab2str(decryptedBuffer);
        } catch (e) {
            throw new Error("Decryption failed. Incorrect password?");
        }
    },

    // Helpers: Base64 to ArrayBuffer and vice versa
    ab2base64: function(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    },

    base642ab: function(base64) {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes;
    }
};
