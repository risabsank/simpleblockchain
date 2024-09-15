import * as CryptoJS from 'crypto-js';
import * as ecdsa from 'elliptic';
import * as _ from 'lodash';

const ec = new ecdsa.ec('secp256k1'); // Initialize elliptic curve cryptography using the 'secp256k1' curve (used in Bitcoin).
const COINBASE_AMOUNT: number = 50; // The reward for mining a block (coinbase transaction reward).

// Class representing an unspent transaction output.
class UnspentTxOut {
    public readonly txOutId: string; // ID of the transaction containing this output.
    public readonly txOutIndex: number; // Index of the output in the transaction.
    public readonly address: string; // The address (public key) owning the output.
    public readonly amount: number; // Amount of currency in the output.

    constructor(txOutId: string, txOutIndex: number, address: string, amount: number) {
        this.txOutId = txOutId;
        this.txOutIndex = txOutIndex;
        this.address = address;
        this.amount = amount;
    }
}

// Class representing a transaction input (refers to a previous unspent transaction output).
class TxIn {
    public txOutId: string; // ID of the previous transaction that this input is referencing.
    public txOutIndex: number; // Index of the output in the previous transaction.
    public signature: string; // The digital signature authorizing the use of this output.
}

// Class representing a transaction output (to whom and how much currency is being sent).
class TxOut {
    public address: string; // The address (public key) receiving the output.
    public amount: number; // The amount of currency being sent.

    constructor(address: string, amount: number) {
        this.address = address;
        this.amount = amount;
    }
}

// Class representing a full transaction.
class Transaction {
    public id: string; // Unique identifier for this transaction (hash of inputs and outputs).
    public txIns: TxIn[]; // Array of transaction inputs.
    public txOuts: TxOut[]; // Array of transaction outputs.
}

// Function to generate the unique transaction ID by hashing the inputs and outputs of the transaction.
const getTransactionId = (transaction: Transaction): string => {
    const txInContent: string = transaction.txIns
        .map((txIn: TxIn) => txIn.txOutId + txIn.txOutIndex) // Concatenate txOutId and txOutIndex for each input.
        .reduce((a, b) => a + b, '');

    const txOutContent: string = transaction.txOuts
        .map((txOut: TxOut) => txOut.address + txOut.amount) // Concatenate address and amount for each output.
        .reduce((a, b) => a + b, '');

    return CryptoJS.SHA256(txInContent + txOutContent).toString(); // Hash the concatenated inputs and outputs to get the transaction ID.
};

// Validates a transaction by checking its structure, inputs, outputs, and ensuring the total input matches the total output.
const validateTransaction = (transaction: Transaction, aUnspentTxOuts: UnspentTxOut[]): boolean => {

    if (!isValidTransactionStructure(transaction)) {
        return false; // Check if the transaction has a valid structure.
    }

    if (getTransactionId(transaction) !== transaction.id) {
        console.log('invalid tx id: ' + transaction.id); // Check if the transaction ID matches its computed value.
        return false;
    }

    // Validate each input in the transaction.
    const hasValidTxIns: boolean = transaction.txIns
        .map((txIn) => validateTxIn(txIn, transaction, aUnspentTxOuts))
        .reduce((a, b) => a && b, true); // All inputs must be valid.

    if (!hasValidTxIns) {
        console.log('some of the txIns are invalid in tx: ' + transaction.id);
        return false;
    }

    // Calculate total input and output values to ensure balance.
    const totalTxInValues: number = transaction.txIns
        .map((txIn) => getTxInAmount(txIn, aUnspentTxOuts))
        .reduce((a, b) => (a + b), 0);

    const totalTxOutValues: number = transaction.txOuts
        .map((txOut) => txOut.amount)
        .reduce((a, b) => (a + b), 0);

    if (totalTxOutValues !== totalTxInValues) {
        console.log('totalTxOutValues !== totalTxInValues in tx: ' + transaction.id);
        return false;
    }

    return true; // Transaction is valid.
};

// Validate all transactions in a block, starting with the coinbase transaction.
const validateBlockTransactions = (aTransactions: Transaction[], aUnspentTxOuts: UnspentTxOut[], blockIndex: number): boolean => {
    const coinbaseTx = aTransactions[0]; // The first transaction in a block must be the coinbase transaction.
    if (!validateCoinbaseTx(coinbaseTx, blockIndex)) {
        console.log('invalid coinbase transaction: ' + JSON.stringify(coinbaseTx));
        return false;
    }

    // Flatten all inputs and check for duplicates (each input can only be used once).
    const txIns: TxIn[] = _(aTransactions)
        .map((tx) => tx.txIns)
        .flatten()
        .value();

    if (hasDuplicates(txIns)) {
        return false; // Duplicates found in transaction inputs.
    }

    // Validate all non-coinbase transactions.
    const normalTransactions: Transaction[] = aTransactions.slice(1);
    return normalTransactions.map((tx) => validateTransaction(tx, aUnspentTxOuts))
        .reduce((a, b) => (a && b), true);
};

// Check if there are any duplicate transaction inputs.
const hasDuplicates = (txIns: TxIn[]): boolean => {
    const groups = _.countBy(txIns, (txIn: TxIn) => txIn.txOutId + txIn.txOutIndex);
    return _(groups)
        .map((value, key) => {
            if (value > 1) {
                console.log('duplicate txIn: ' + key); // Log duplicate inputs.
                return true;
            } else {
                return false;
            }
        })
        .includes(true); // If any duplicates are found, return true.
};

// Validate the coinbase transaction (only one input and output, and reward must be the correct amount).
const validateCoinbaseTx = (transaction: Transaction, blockIndex: number): boolean => {
    if (transaction == null) {
        console.log('the first transaction in the block must be coinbase transaction');
        return false;
    }
    if (getTransactionId(transaction) !== transaction.id) {
        console.log('invalid coinbase tx id: ' + transaction.id);
        return false;
    }
    if (transaction.txIns.length !== 1) {
        console.log('one txIn must be specified in the coinbase transaction');
        return;
    }
    if (transaction.txIns[0].txOutIndex !== blockIndex) {
        console.log('the txIn signature in coinbase tx must be the block height');
        return false;
    }
    if (transaction.txOuts.length !== 1) {
        console.log('invalid number of txOuts in coinbase transaction');
        return false;
    }
    if (transaction.txOuts[0].amount !== COINBASE_AMOUNT) {
        console.log('invalid coinbase amount in coinbase transaction');
        return false;
    }
    return true;
};

// Validate a transaction input by checking the referenced unspent output and verifying the signature.
const validateTxIn = (txIn: TxIn, transaction: Transaction, aUnspentTxOuts: UnspentTxOut[]): boolean => {
    const referencedUTxOut: UnspentTxOut =
        aUnspentTxOuts.find((uTxO) => uTxO.txOutId === txIn.txOutId && uTxO.txOutIndex === txIn.txOutIndex);
    if (referencedUTxOut == null) {
        console.log('referenced txOut not found: ' + JSON.stringify(txIn)); // Referenced output does not exist.
        return false;
    }
    const address = referencedUTxOut.address;

    // Verify that the input was signed by the private key associated with the referenced output's public key.
    const key = ec.keyFromPublic(address, 'hex');
    const validSignature: boolean = key.verify(transaction.id, txIn.signature);
    if (!validSignature) {
        console.log('invalid txIn signature: %s txId: %s address: %s', txIn.signature, transaction.id, referencedUTxOut.address);
        return false;
    }
    return true;
};

// Get the amount associated with a transaction input by finding the referenced unspent transaction output.
const getTxInAmount = (txIn: TxIn, aUnspentTxOuts: UnspentTxOut[]): number => {
    return findUnspentTxOut(txIn.txOutId, txIn.txOutIndex, aUnspentTxOuts).amount;
};

// Find a specific unspent transaction output by transaction ID and output index.
const findUnspentTxOut = (transactionId: string, index: number, aUnspentTxOuts: UnspentTxOut[]): UnspentTxOut => {
    return aUnspentTxOuts.find((uTxO) => uTxO.txOutId === transactionId && uTxO.txOutIndex === index);
};

// Sign a transaction input with a private key to authorize the transaction.
const signTxIn = (transaction: Transaction, txInIndex: number, privateKey: string, aUnspentTxOuts: UnspentTxOut[]): string => {
    const txIn: TxIn = transaction.txIns[txInIndex];
    const referencedUnspentTxOut: UnspentTxOut = findUnspentTxOut(txIn.txOutId, txIn.txOutIndex, aUnspentTxOuts);
    if (referencedUnspentTxOut == null) {
        throw Error('could not find referenced txOut');
    }
    const key = ec.keyFromPrivate(privateKey, 'hex');
    const signature: string = toHexString(key.sign(transaction.id).toDER());
    return signature;
};

// Create the coinbase transaction (reward for mining a new block).
const getCoinbaseTransaction = (address: string, blockIndex: number): Transaction => {
    const t = new Transaction();
    const txIn: TxIn = new TxIn();
    txIn.signature = '';
    txIn.txOutId = '';
    txIn.txOutIndex = blockIndex;
    t.txIns = [txIn];
    t.txOuts = [new TxOut(address, COINBASE_AMOUNT)];
    t.id = getTransactionId(t);
    return t;
};

// Process a set of transactions by validating them and updating the list of unspent transaction outputs.
const processTransactions = (aTransactions: Transaction[], aUnspentTxOuts: UnspentTxOut[], blockIndex: number): UnspentTxOut[] => {
    if (!validateBlockTransactions(aTransactions, aUnspentTxOuts, blockIndex)) {
        console.log('invalid block transactions');
        return null;
    }

    return updateUnspentTxOuts(aTransactions, aUnspentTxOuts);
};

// Update the unspent transaction outputs by removing spent outputs and adding new ones.
const updateUnspentTxOuts = (aTransactions: Transaction[], aUnspentTxOuts: UnspentTxOut[]): UnspentTxOut[] => {
    const newUnspentTxOuts: UnspentTxOut[] = aTransactions
        .map((t) => {
            return t.txOuts.map((txOut, index) => new UnspentTxOut(t.id, index, txOut.address, txOut.amount));
        })
        .reduce((a, b) => a.concat(b), []);

    const consumedTxOuts: UnspentTxOut[] = aTransactions
        .map((t) => t.txIns)
        .reduce((a, b) => a.concat(b), [])
        .map((txIn) => new UnspentTxOut(txIn.txOutId, txIn.txOutIndex, '', 0));

    return aUnspentTxOuts
        .filter((uTxO) => !findUnspentTxOut(uTxO.txOutId, uTxO.txOutIndex, consumedTxOuts))
        .concat(newUnspentTxOuts);
};

// Utility function: Convert a byte array to a hexadecimal string.
const toHexString = (byteArray): string => {
    return Array.from(byteArray, (byte: number) => ('0' + (byte & 0xff).toString(16)).slice(-2)).join('');
};

// Utility function: Get the public key from a private key.
const getPublicKey = (privateKey: string): string => {
    return ec.keyFromPrivate(privateKey, 'hex').getPublic().encode('hex', false);
};

// Utility function: Validate the structure of a transaction input.
const isValidTxInStructure = (txIn: TxIn): boolean => {
    if (txIn == null) {
        console.log('txIn is null');
        return false;
    } else if (typeof txIn.signature !== 'string') {
        console.log('invalid signature type in txIn');
        return false;
    } else if (typeof txIn.txOutId !== 'string') {
        console.log('invalid txOutId type in txIn');
        return false;
    } else if (typeof txIn.txOutIndex !== 'number') {
        console.log('invalid txOutIndex type in txIn');
        return false;
    }
    return true;
};

// Utility function: Validate the structure of a transaction output.
const isValidTxOutStructure = (txOut: TxOut): boolean => {
    if (txOut == null) {
        console.log('txOut is null');
        return false;
    } else if (typeof txOut.address !== 'string') {
        console.log('invalid address type in txOut');
        return false;
    } else if (!isValidAddress(txOut.address)) {
        console.log('invalid TxOut address');
        return false;
    } else if (typeof txOut.amount !== 'number') {
        console.log('invalid amount type in txOut');
        return false;
    }
    return true;
};

// Utility function: Validate an address (must be a valid ECDSA public key).
const isValidAddress = (address: string): boolean => {
    if (address.length !== 130) {
        console.log('invalid public key length');
        return false;
    } else if (address.match('^[a-fA-F0-9]+$') === null) {
        console.log('public key must contain only hex characters');
        return false;
    } else if (!address.startsWith('04')) {
        console.log('public key must start with 04');
        return false;
    }
    return true;
};
