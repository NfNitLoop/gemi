import * as ed from "@noble/ed25519"
import bs58c from "bs58check"
import bs58 from "bs58"

// enable sync operations in ed.*:
// See: https://github.com/paulmillr/noble-ed25519
import {sha512} from "@noble/hashes/sha2"
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))



/**
 * UserIDs are NaCL signing keys.
 */
export class UserID {
    toString(): string {
        return this.asBase58
    }

    /**
     * @returns this.asBase58 for easy serialization to JSON.
     */
    toJSON(): string {
        return this.asBase58
    }

    [Symbol.for("Deno.customInspect")](): string {
        return Deno.inspect(this.asBase58)
    }

    static fromString(userID: string): UserID {
        const valType = typeof(userID)
        if (valType !== "string") {
            throw new Error(`invalid userID string of type ${valType}`)
        }
        if (userID.length == 0) {
            throw new Error("UserID must not be empty.")
        }
    
        let buf: Uint8Array;
        try {
            buf = bs58.decode(userID)
        } catch (cause) {
            throw new Error("UserID not valid base58", {cause})
        }
    
        UserID.#validateBytes(buf)
        return new UserID(buf, userID)
    }


    static tryFromString(userID: string): UserID|null {
        try {
            return UserID.fromString(userID)
        } catch (_error) {
            return null
        }
    }

    static #validateBytes(bytes: Uint8Array) {
        if (bytes.length < USER_ID_BYTES) {
            throw "UserID too short"
        }
    
        if (bytes.length == PASSWORD_BYTES) {
            throw "UserID too long. (This may be a password!?)"
        }
    
        if (bytes.length > USER_ID_BYTES) {
            throw "UserID too long."
        }
    }

    static fromBytes(bytes: Uint8Array): UserID {
        UserID.#validateBytes(bytes)
        return new UserID(bytes, bs58.encode(bytes))
    }

    private constructor(readonly bytes: Uint8Array, readonly asBase58: string) { }
}


/**
 * Private keys are stored as base58check-encoded strings.
 * They are only necessary to sign new pieces of content.
 * You should keep a PrivateKey in memory for as short a time as possible.
 */
export class PrivateKey {

    static fromBase58(privateKey: string): PrivateKey {

        // Error to display about the private key:
        let buf: Uint8Array;
        try {
            buf = bs58.decode(privateKey)
        } catch (_error) {
            throw "Not valid base58"
        }

        // Secret is 32 bytes, + 4 for checked base58.
        if (buf.length < 36) {
            throw "Key is too short."
        }
        if (buf.length > 36) {
            throw "Key is too long."
        }

        try {
            buf = bs58c.decode(privateKey)
        } catch (_error) {
            throw "Invalid Key"
        }

        return PrivateKey.fromBytes(buf)
    }

    /**
     * Create a new, random Private Key. (and its associated public key, aka UserID.)
     */
    static createNew(): PrivateKey {
        return PrivateKey.fromBytes(ed.utils.randomPrivateKey())
    }

    private static fromBytes(bytes: Uint8Array): PrivateKey {
        return new PrivateKey(bytes)
    }

    readonly userID: UserID;
    readonly asBase58: string
    #private: Uint8Array

    private constructor(bytes: Uint8Array) {
        this.#private = bytes
        this.userID = UserID.fromBytes(ed.getPublicKey(bytes))
        this.asBase58 = bs58c.encode(bytes)
    }

    /**
     * @deprecated use sign() instead.
     */
    signDetached(message: Uint8Array): Uint8Array {
        return ed.sign(message, this.#private)
    }

    /** Create a detached signature over a given message */
    sign(message: Uint8Array): Signature {
        return Signature.fromBytes(ed.sign(message, this.#private))
    }
           
}

/**
 * A detached NaCL signature over an Item.
 */
export class Signature {
    readonly bytes: Uint8Array

    toString(): string {
        return this.asBase58
    }

    /**
     * @returns this.asBase58 for easy serialization to JSON.
     */
    toJSON(): string {
        return this.asBase58
    }

    [Symbol.for("Deno.customInspect")](): string {
        return Deno.inspect(this.asBase58)
    }

    // Check that a signature is valid.
    // deno-lint-ignore require-await
    async isValid(userID: UserID, bytes: Uint8Array): Promise<boolean> {
        return this.isValidSync(userID, bytes)
    }

    isValidSync(userID: UserID, bytes: Uint8Array): boolean {
        return ed.verify(this.bytes, bytes, userID.bytes)
    }

    static fromString(signature: string): Signature {
        if (signature.length == 0) {
            throw "Signature must not be empty."
        }
    
        let buf: Uint8Array;
        try {
            buf = bs58.decode(signature)
        } catch (_error) {
            throw "Signature not valid base58"
        }
    
        return Signature.fromBytes(buf)
    }

    static tryFromString(userID: string): Signature|null {
        try {
            return Signature.fromString(userID)
        } catch {
            return null
        }
    }

    static fromBytes(bytes: Uint8Array): Signature {
        if (bytes.length < SIGNATURE_BYTES) {
            throw new Error("Signature too short")
        }
    
        if (bytes.length > SIGNATURE_BYTES) {
            throw new Error("Signature too long.")
        }
    
        return new Signature(bytes, bs58.encode(bytes))
    }

    private constructor(bytes: Uint8Array, readonly asBase58: string) {
        this.bytes = bytes
    }
}

const USER_ID_BYTES = 32;
const SIGNATURE_BYTES = 64;
const PASSWORD_BYTES = USER_ID_BYTES + 4 // 4 bytes b58 checksum.



