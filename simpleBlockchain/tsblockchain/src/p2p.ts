import * as WebSocket from 'ws'; // Import WebSocket library
import {Server} from 'ws'; // Import WebSocket Server class
import {
    addBlockToChain, Block, getBlockchain, getLatestBlock, handleReceivedTransaction, isValidBlockStructure,
    replaceChain
} from './blockchain'; // Import blockchain-related functions and structures
import {Transaction} from './transaction'; // Import Transaction structure
import {getTransactionPool} from './transactionPool'; // Import function to get current transaction pool

const sockets: WebSocket[] = []; // Store active WebSocket connections in this array

// Define the types of messages the P2P network will use
enum MessageType {
    QUERY_LATEST = 0,               // Request for the latest block
    QUERY_ALL = 1,                  // Request for the entire blockchain
    RESPONSE_BLOCKCHAIN = 2,        // Response containing the blockchain or latest block
    QUERY_TRANSACTION_POOL = 3,     // Request for the transaction pool
    RESPONSE_TRANSACTION_POOL = 4   // Response containing the transaction pool
}

// Structure of the message object
class Message {
    public type: MessageType; // Type of message being sent
    public data: any;         // Payload of the message
}

// Initializes the WebSocket P2P server at the given port
const initP2PServer = (p2pPort: number) => {
    const server: Server = new WebSocket.Server({port: p2pPort}); // Create WebSocket server
    server.on('connection', (ws: WebSocket) => {
        initConnection(ws); // Handle new connections
    });
    console.log('listening websocket p2p port on: ' + p2pPort); // Log when server is running
};

// Getter function to return the active WebSocket connections
const getSockets = () => sockets;

// Initializes a new connection to the WebSocket
const initConnection = (ws: WebSocket) => {
    sockets.push(ws); // Add the new WebSocket connection to the sockets array
    initMessageHandler(ws); // Set up how messages from this WebSocket will be handled
    initErrorHandler(ws); // Handle errors and disconnections

    // Send a request to the peer for the latest block
    write(ws, queryChainLengthMsg());

    // Query the transaction pool after a short delay to avoid network overload
    setTimeout(() => {
        broadcast(queryTransactionPoolMsg());
    }, 500);
};

// Converts a JSON string into an object of type T
const JSONToObject = <T>(data: string): T => {
    try {
        return JSON.parse(data); // Parse the JSON string
    } catch (e) {
        console.log(e); // Log any errors
        return null;
    }
};

// Sets up the WebSocket message handler, determining how to process incoming messages
const initMessageHandler = (ws: WebSocket) => {
    ws.on('message', (data: string) => {
        try {
            const message: Message = JSONToObject<Message>(data); // Parse the received message
            if (message === null) {
                console.log('could not parse received JSON message: ' + data);
                return;
            }
            console.log('Received message: %s', JSON.stringify(message));
            switch (message.type) {
                case MessageType.QUERY_LATEST:
                    write(ws, responseLatestMsg()); // Send latest block
                    break;
                case MessageType.QUERY_ALL:
                    write(ws, responseChainMsg()); // Send the entire blockchain
                    break;
                case MessageType.RESPONSE_BLOCKCHAIN:
                    const receivedBlocks: Block[] = JSONToObject<Block[]>(message.data);
                    if (receivedBlocks === null) {
                        console.log('invalid blocks received: %s', JSON.stringify(message.data));
                        break;
                    }
                    handleBlockchainResponse(receivedBlocks); // Handle incoming blockchain data
                    break;
                case MessageType.QUERY_TRANSACTION_POOL:
                    write(ws, responseTransactionPoolMsg()); // Send transaction pool data
                    break;
                case MessageType.RESPONSE_TRANSACTION_POOL:
                    const receivedTransactions: Transaction[] = JSONToObject<Transaction[]>(message.data);
                    if (receivedTransactions === null) {
                        console.log('invalid transaction received: %s', JSON.stringify(message.data));
                        break;
                    }
                    // Add received transactions to the transaction pool
                    receivedTransactions.forEach((transaction: Transaction) => {
                        try {
                            handleReceivedTransaction(transaction); // Handle the received transaction
                            broadCastTransactionPool(); // Broadcast updated transaction pool
                        } catch (e) {
                            console.log(e.message);
                        }
                    });
                    break;
            }
        } catch (e) {
            console.log(e); // Handle any errors
        }
    });
};

// Sends a message via WebSocket connection
const write = (ws: WebSocket, message: Message): void => ws.send(JSON.stringify(message));

// Broadcasts a message to all WebSocket connections
const broadcast = (message: Message): void => sockets.forEach((socket) => write(socket, message));

// Query message for the latest block
const queryChainLengthMsg = (): Message => ({'type': MessageType.QUERY_LATEST, 'data': null});

// Query message for the entire blockchain
const queryAllMsg = (): Message => ({'type': MessageType.QUERY_ALL, 'data': null});

// Response message with the entire blockchain
const responseChainMsg = (): Message => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(getBlockchain())
});

// Response message with only the latest block
const responseLatestMsg = (): Message => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify([getLatestBlock()])
});

// Query message for the transaction pool
const queryTransactionPoolMsg = (): Message => ({
    'type': MessageType.QUERY_TRANSACTION_POOL,
    'data': null
});

// Response message with the transaction pool
const responseTransactionPoolMsg = (): Message => ({
    'type': MessageType.RESPONSE_TRANSACTION_POOL,
    'data': JSON.stringify(getTransactionPool())
});

// Handles WebSocket errors and closes connections
const initErrorHandler = (ws: WebSocket) => {
    const closeConnection = (myWs: WebSocket) => {
        console.log('connection failed to peer: ' + myWs.url);
        sockets.splice(sockets.indexOf(myWs), 1); // Remove the connection from the array
    };
    ws.on('close', () => closeConnection(ws)); // Handle closed connections
    ws.on('error', () => closeConnection(ws)); // Handle errored connections
};

// Handles the received blockchain data from peers
const handleBlockchainResponse = (receivedBlocks: Block[]) => {
    if (receivedBlocks.length === 0) {
        console.log('received block chain size of 0');
        return;
    }
    const latestBlockReceived: Block = receivedBlocks[receivedBlocks.length - 1];
    if (!isValidBlockStructure(latestBlockReceived)) {
        console.log('block structuture not valid');
        return;
    }
    const latestBlockHeld: Block = getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log('blockchain possibly behind. We got: '
            + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            if (addBlockToChain(latestBlockReceived)) {
                broadcast(responseLatestMsg()); // Broadcast the new block if added
            }
        } else if (receivedBlocks.length === 1) {
            console.log('We have to query the chain from our peer');
            broadcast(queryAllMsg()); // Request full blockchain if needed
        } else {
            console.log('Received blockchain is longer than current blockchain');
            replaceChain(receivedBlocks); // Replace local chain with received chain
        }
    } else {
        console.log('received blockchain is not longer than current blockchain. Do nothing');
    }
};

// Broadcasts the latest block to all peers
const broadcastLatest = (): void => {
    broadcast(responseLatestMsg());
};

// Connect to a new peer and add the peer's WebSocket to the list of connections
const connectToPeers = (newPeer: string): void => {
    const ws: WebSocket = new WebSocket(newPeer);
    ws.on('open', () => {
        initConnection(ws); // Initialize connection when opened
    });
    ws.on('error', () => {
        console.log('connection failed');
    });
};

// Broadcasts the updated transaction pool to all peers
const broadCastTransactionPool = () => {
    broadcast(responseTransactionPoolMsg());
};

// Export key functions for use in other modules
export {connectToPeers, broadcastLatest, broadCastTransactionPool, initP2PServer, getSockets};
