# stream-demux
An asynchronous iterable stream demultiplexer.

Lets you write data to multiple async iterable streams from a central place without keeping any references to those streams.

## Installation

```
npm install stream-demux
```

## Usage

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
  for (let i = 0; i < 10; i++) {
    await wait(10);
    demux.write('abc', 'message-abc-' + i);
    demux.write('def', 'message-def-' + i);
  }
  demux.end('abc');
  demux.end('def');
})();
```

## Goal

The goal of this module is to efficiently distribute data to a large number of named asynchronous streams while facilitating programming patterns which decrease the probability of memory leaks.

Each stream returned by this module is responsible for picking up its own data from a shared source stream - This means that the stream-demux module doesn't hold any references to streams which it produces via its `stream()` method; this reduces the likelihood of programming mistakes which would lead to memory leaks because streams don't need to be destroyed or cleaned up explicitly.

The downside to making each stream responsible for consuming its own data is that having a lot of concurrent streams can have a negative impact on performance (especially if there are a lot of idle streams). The goal of stream-demux is to keep that overhead to a minimum.
