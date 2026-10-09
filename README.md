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
  // timeout after n milliseconds of inactivity.
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

## Consumer lifetime

A `StreamDemux` owns its streams; each one is created on demand when a consumer
asks for it by name and is dropped as soon as its last consumer goes away. That
is why no cleanup is needed beyond ending consumption, which you do by breaking
out of the `for-await-of` loop, or by calling `consumer.return()`, `kill()` or
`killAll()`.

A consequence is that a consumer must not be reused once its iteration has
ended. Create a new one instead:

```js
let consumer = demux.stream('abc').createConsumer();
for await (let packet of consumer) {
  if (packet === 'stop') break;
}

// Do not iterate `consumer` again; ask the demux for a new one.
let nextConsumer = demux.stream('abc').createConsumer();
```

Reusing a consumer after its loop has ended leaves it attached to a stream the
demux has already dropped, so it will never receive anything written through
`demux.write()` and cannot be reached by `kill()` or `close()`. (A consumer
created directly on a `WritableConsumableStream` *can* be reused, because there
the stream's lifetime is yours to manage rather than the demux's.)

`demux.unstream(streamName)` detaches a stream from the demux and kills its
consumers, so their loops end rather than hanging on a stream nothing can
reach any more.

## Goal

The goal of this module is to facilitate functional programming patterns which decrease the probability of memory leaks and race conditions.
It serves as an alternative to callback-based event handling.
