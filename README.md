# stream-demux
An consumable stream demultiplexer.

Lets you write data to multiple consumable streams from a central place without keeping any references to those streams.
The `StreamDemux` class returns streams of class `DemuxedConsumableStream` (base class `ConsumableStream`).  
See https://github.com/SocketCluster/consumable-stream

This library uses a queue which is implemented as a singly-linked list; this allows each loop to consume at its own pace without missing any events (supports nested await statements). An 'event' in the queue can be garbage-collected as soon as the slowest consumer moves its pointer past it.

## Installation

```
npm install stream-demux
```

## Usage

### Consuming using async loops

```js
let demux = new StreamDemux();

(async () => {
  // Consume data from 'abc' stream.
  let substream = demux.stream('abc');
  for await (let packet of substream) {
    console.log('ABC:', packet);
  }
})();

(async () => {
  // Consume data from 'def' stream.
  let substream = demux.stream('def');
  for await (let packet of substream) {
    console.log('DEF:', packet);
  }
})();

(async () => {
  // Consume data from 'def' stream.
  // Can also work with a while loop for older environments.
  // Can have multiple loops consuming the same stream at
  // the same time.
  // Note that you can optionally pass a number n to the
  // createConsumer(n) method to force the iteration to
  // timeout after n milliseconds of innactivity.
  let consumer = demux.stream('def').createConsumer();
  while (true) {
    let packet = await consumer.next();
    if (packet.done) break;
    console.log('DEF (while loop):', packet.value);
  }
})();

(async () => {
  for (let i = 0; i < 10; i++) {
    await wait(10);
    demux.write('abc', 'message-abc-' + i);
    demux.write('def', 'message-def-' + i);
  }
  demux.close('abc');
  demux.close('def');
})();

// Utility function for using setTimeout() with async/await.
function wait(duration) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, duration);
  });
}
```

### Consuming using the once method

```js
// Log the next received packet from the abc stream.
(async () => {
  // The returned promise never times out.
  let packet = await demux.stream('abc').once();
  console.log('Packet:', packet);
})();

// Same as above, except with a timeout of 10 seconds.
(async () => {
  try {
    let packet = await demux.stream('abc').once(10000);
    console.log('Packet:', packet);
  } catch (err) {
    // If no packets are written to the 'abc' stream before
    // the timeout, an error will be thrown and handled here.
    // The err.name property will be 'TimeoutError'.
    console.log('Error:', err);
  }
})();
```

## Goal

The goal of this module is to efficiently distribute data to a large number of named asynchronous streams while facilitating functional programming patterns which decrease the probability of memory leaks.

Each stream returned by this module is responsible for picking up its own data from a shared source stream - This means that the stream-demux module doesn't hold any references to streams which it produces via its `stream()` method; this reduces the likelihood of programming mistakes which would lead to memory leaks because streams don't need to be destroyed or cleaned up explicitly.

The downside to making each stream responsible for consuming its own data is that having a lot of concurrent streams can have a negative impact on performance (especially if there are a lot of idle streams). A goal of stream-demux is to keep that overhead to a minimum.
