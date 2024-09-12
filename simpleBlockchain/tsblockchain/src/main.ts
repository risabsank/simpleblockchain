import * as  bodyParser from 'body-parser';
import * as express from 'express';
import * as _ from 'lodash';
import {
    Block, generateNextBlock, generatenextBlockWithTransaction, generateRawNextBlock, getAccountBalance,
    getBlockchain, getMyUnspentTransactionOutputs, getUnspentTxOuts, sendTransaction
} from './blockchain';
import {connectToPeers, getSockets, initP2PServer} from './p2p';
import {UnspentTxOut} from './transaction';
import {getTransactionPool} from './transactionPool';
import {getPublicFromWallet, initWallet} from './wallet';

// Sets HTTP and P2P server ports from environment variables or defaults (3001 for HTTP, 6001 for P2P).
const httpPort: number = parseInt(process.env.HTTP_PORT) || 3001;
const p2pPort: number = parseInt(process.env.P2P_PORT) || 6001;

const initHttpServer = (myHttpPort: number) => {
    const app = express();
    app.use(bodyParser.json());

    // Initializes the HTTP server using Express and sets up bodyParser to parse JSON requests.
    // Catches errors and responds with a 400 status and the error message.
    app.use((err, req, res, next) => {
        if (err) {
            res.status(400).send(err.message);
        }
    });

    // Sends the entire blockchain in response to /blocks.
    app.get('/blocks', (req, res) => {
        res.send(getBlockchain());
    });

    // Finds and returns a block by its hash
    app.get('/block/:hash', (req, res) => {
        const block = _.find(getBlockchain(), {'hash' : req.params.hash});
        res.send(block);
    });

    // Searches for and returns a transaction by ID.
    app.get('/transaction/:id', (req, res) => {
        const tx = _(getBlockchain())
            .map((blocks) => blocks.data)
            .flatten()
            .find({'id': req.params.id});
        res.send(tx);
    });

    // Finds and returns all unspent transactions for a given address
    app.get('/address/:address', (req, res) => {
        const unspentTxOuts: UnspentTxOut[] =
            _.filter(getUnspentTxOuts(), (uTxO) => uTxO.address === req.params.address);
        res.send({'unspentTxOuts': unspentTxOuts});
    });

    // Returns all unspent transaction outputs (UTXOs).
    app.get('/unspentTransactionOutputs', (req, res) => {
        res.send(getUnspentTxOuts());
    });

    // Returns the unspent transaction outputs associated with the wallet
    app.get('/myUnspentTransactionOutputs', (req, res) => {
        res.send(getMyUnspentTransactionOutputs());
    });

    // Mines a block with raw data provided in the request. If no data is provided, returns an error
    app.post('/mineRawBlock', (req, res) => {
        if (req.body.data == null) {
            res.send('data parameter is missing');
            return;
        }
        const newBlock: Block = generateRawNextBlock(req.body.data);
        if (newBlock === null) {
            res.status(400).send('could not generate block');
        } else {
            res.send(newBlock);
        }
    });

    // Mines a new block based on current blockchain data
    app.post('/mineBlock', (req, res) => {
        const newBlock: Block = generateNextBlock();
        if (newBlock === null) {
            res.status(400).send('could not generate block');
        } else {
            res.send(newBlock);
        }
    });

    // Retrieves and sends the current account balance from the wallet
    app.get('/balance', (req, res) => {
        const balance: number = getAccountBalance();
        res.send({'balance': balance});
    });

    // Sends the public address from the wallet.
    app.get('/address', (req, res) => {
        const address: string = getPublicFromWallet();
        res.send({'address': address});
    });

    // Mines a new block with a transaction sent to a given address for a specified amount
    app.post('/mineTransaction', (req, res) => {
        const address = req.body.address;
        const amount = req.body.amount;
        try {
            const resp = generatenextBlockWithTransaction(address, amount);
            res.send(resp);
        } catch (e) {
            console.log(e.message);
            res.status(400).send(e.message);
        }
    });

    // Sends a transaction to a specified address with the specified amount
    app.post('/sendTransaction', (req, res) => {
        try {
            const address = req.body.address;
            const amount = req.body.amount;

            if (address === undefined || amount === undefined) {
                throw Error('invalid address or amount');
            }
            const resp = sendTransaction(address, amount);
            res.send(resp);
        } catch (e) {
            console.log(e.message);
            res.status(400).send(e.message);
        }
    });

    // Returns the current pool of pending transactions
    app.get('/transactionPool', (req, res) => {
        res.send(getTransactionPool());
    });

    // Lists all connected peers in the P2P network
    app.get('/peers', (req, res) => {
        res.send(getSockets().map((s: any) => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });
    // Adds a new peer to the P2P network using the provided peer address
    app.post('/addPeer', (req, res) => {
        connectToPeers(req.body.peer);
        res.send();
    });

    // Stops the HTTP and P2P servers
    app.post('/stop', (req, res) => {
        res.send({'msg' : 'stopping server'});
        process.exit();
    });

    // Starts the HTTP server on the specified port
    app.listen(myHttpPort, () => {
        console.log('Listening http on port: ' + myHttpPort);
    });
};

initHttpServer(httpPort);
initP2PServer(p2pPort);
initWallet();

// Summary:
    // HTTP API: Provides endpoints for block, transaction, balance, and peer management.
    // P2P Network: Manages peer connections for the blockchain.
    // Wallet: Manages a wallet for sending and receiving transactions.
