import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import ed2curve from 'ed2curve';
import crypto from 'crypto';

// Function to test encryption where alice sends an initial message to Bob
// without otk
function main() {
    const edIdentityKeyPairAlice = nacl.sign.keyPair(); 
    const identityKeyPairAlice = ed2curve.convertKeyPair(edIdentityKeyPairAlice); //X25519 keypair
    const signedPreKeyPairAlice = nacl.box.keyPair(); // X25519 keypair
    const ephemeralKeyPairAlice = nacl.box.keyPair(); // ephemeral keypair for the session

    const edIdentityKeyPairBob = nacl.sign.keyPair(); 
    const identityKeyPairBob = ed2curve.convertKeyPair(edIdentityKeyPairBob); //X25519 keypair
    const signedPreKeyPairBob = nacl.box.keyPair(); // X25519 keypair

    // Generate the first shared secret
    const EKa1 = ephemeralKeyPairAlice.secretKey;
    const IKa1 = identityKeyPairAlice.secretKey;
    const SPKb1 = signedPreKeyPairBob.publicKey;
    const IKb1 = identityKeyPairBob.publicKey;

    const dh11 = nacl.scalarMult(IKa1, SPKb1);
    const dh12 = nacl.scalarMult(EKa1, IKb1);
    const dh13 = nacl.scalarMult(EKa1, SPKb1); 

    const concatSecrets1 = new Uint8Array(
        dh11.length + dh12.length + dh13.length
    );

    concatSecrets1.set(dh11, 0);
    concatSecrets1.set(dh12, dh11.length);
    concatSecrets1.set(dh13, dh11.length + dh12.length);

    const hash1 = crypto.createHash('sha256');
    hash1.update(concatSecrets1);
    const sk1 = hash1.digest();
    const sharedSecretBase641 = naclUtil.encodeBase64(sk1);
    
    console.log("Shared Secret Base641:", sharedSecretBase641);

    // generate the encrypted message 
    const initialMessage = "Hello, this is a secure message!";
    const messageUint8 = naclUtil.decodeUTF8(initialMessage);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const encrypted = nacl.secretbox(messageUint8, nonce, sk1);
    
    console.log("Encrypted Message:", naclUtil.encodeBase64(encrypted));
    

    // get the second shared secret
    const EKa2 = ephemeralKeyPairAlice.publicKey;
    const IKa2 = identityKeyPairAlice.publicKey;
    const SPKb2 = signedPreKeyPairBob.secretKey;
    const IKb2 = identityKeyPairBob.secretKey;

    const dh21 = nacl.scalarMult(SPKb2, IKa2);
    const dh22 = nacl.scalarMult(IKb2, EKa2);
    const dh23 = nacl.scalarMult(SPKb2, EKa2); 

    const concatSecrets2 = new Uint8Array(
        dh21.length + dh22.length + dh23.length
    );

    concatSecrets2.set(dh21, 0);
    concatSecrets2.set(dh22, dh21.length);
    concatSecrets2.set(dh23, dh21.length + dh22.length);

    const hash2 = crypto.createHash('sha256');
    hash2.update(concatSecrets2);
    const sk2 = hash2.digest();
    const sharedSecretBase642 = naclUtil.encodeBase64(sk2);
    
    console.log("Shared Secret Base642:", sharedSecretBase642);
    
    // decode the encrypted message
    const decrypted = nacl.secretbox.open(encrypted, nonce, sk2);
    const decryptedMessage = naclUtil.encodeUTF8(decrypted);
    console.log("Decrypted Message:", decryptedMessage);
}

main();