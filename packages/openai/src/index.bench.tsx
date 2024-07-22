import { AINode, createRenderContext } from '@ai-jsx/core';
import { tokenizerForModel } from './index.js';
import { bench, expect } from 'vitest';
import { Tokenizer } from '@ai-jsx/core/tokenizer';

function Tokenize({
  children,
  model,
  expected,
}: {
  children: AINode;
  model: Parameters<typeof tokenizerForModel>[0];
  expected: number;
}) {
  return (
    <Tokenizer.Provider value={tokenizerForModel(model)}>
      {({ getContext, render }) =>
        render(children)
          .untilComplete()
          .then((node) => {
            const tokenizer = getContext(Tokenizer);
            const tokens = tokenizer(node);
            if (tokens !== expected) {
              console.log(`Expected ${expected} tokens, got ${tokens}`);
              throw new Error(`Expected ${expected} tokens, got ${tokens}`);
            }
            return 'PASS';
          })
      }
    </Tokenizer.Provider>
  );
}

bench('tokenize one message (gpt-4o)', async () => {
  const result = await createRenderContext()
    .render(
      <Tokenize expected={7} model="gpt-4o">
        <user>Hello, world!</user>
      </Tokenize>,
    )
    .untilComplete();
  expect(result.toString()).toBe('PASS');
});

bench('tokenize one very long message (gpt-4o)', async () => {
  const result = await createRenderContext()
    .render(
      <Tokenize expected={894} model="gpt-4o">
        <user>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore
          magna aliqua. Volutpat ac tincidunt vitae semper. Vel orci porta non pulvinar neque laoreet suspendisse
          interdum consectetur. Turpis massa tincidunt dui ut ornare lectus sit amet est. Blandit massa enim nec dui
          nunc mattis. Ornare massa eget egestas purus viverra accumsan in. Et tortor consequat id porta nibh venenatis.
          Diam vulputate ut pharetra sit amet aliquam id diam. Nibh nisl condimentum id venenatis a condimentum vitae
          sapien pellentesque. Dignissim cras tincidunt lobortis feugiat vivamus at augue eget arcu. Nisl rhoncus mattis
          rhoncus urna neque viverra. Nunc sed id semper risus in hendrerit gravida rutrum. Euismod in pellentesque
          massa placerat. Ullamcorper eget nulla facilisi etiam dignissim diam quis. Facilisi morbi tempus iaculis urna
          id volutpat lacus laoreet non. Diam ut venenatis tellus in metus vulputate eu scelerisque felis. Massa
          placerat duis ultricies lacus sed turpis tincidunt id. Eget gravida cum sociis natoque penatibus et magnis dis
          parturient. Tortor pretium viverra suspendisse potenti nullam ac tortor vitae purus. Amet risus nullam eget
          felis eget nunc lobortis mattis. Penatibus et magnis dis parturient montes nascetur. Sagittis purus sit amet
          volutpat consequat mauris. Ridiculus mus mauris vitae ultricies leo integer. Molestie nunc non blandit massa
          enim nec dui nunc mattis. Mauris augue neque gravida in. Urna neque viverra justo nec ultrices dui sapien.
          Massa eget egestas purus viverra. Augue neque gravida in fermentum et sollicitudin ac orci. Augue interdum
          velit euismod in pellentesque. Urna et pharetra pharetra massa massa ultricies. Amet purus gravida quis
          blandit turpis cursus in hac. Pretium aenean pharetra magna ac placerat vestibulum lectus mauris ultrices.
          Egestas fringilla phasellus faucibus scelerisque eleifend donec pretium vulputate sapien. Lectus magna
          fringilla urna porttitor. Mauris vitae ultricies leo integer malesuada nunc vel risus. Donec ac odio tempor
          orci dapibus. Malesuada nunc vel risus commodo viverra maecenas accumsan lacus. Dolor sit amet consectetur
          adipiscing elit pellentesque. Viverra nam libero justo laoreet sit. Vel facilisis volutpat est velit egestas
          dui id ornare arcu. Risus ultricies tristique nulla aliquet enim tortor at auctor urna. Sed id semper risus in
          hendrerit gravida rutrum quisque. Urna porttitor rhoncus dolor purus. Egestas sed tempus urna et pharetra
          pharetra massa massa ultricies. Fringilla ut morbi tincidunt augue interdum velit euismod in pellentesque.
          Cras adipiscing enim eu turpis egestas pretium. Mattis molestie a iaculis at erat pellentesque adipiscing.
          Pretium aenean pharetra magna ac placerat vestibulum lectus mauris ultrices. Lectus arcu bibendum at varius
          vel pharetra vel. Malesuada nunc vel risus commodo viverra. Volutpat diam ut venenatis tellus. Quis vel eros
          donec ac. Vivamus at augue eget arcu dictum varius duis at consectetur. In iaculis nunc sed augue. Molestie a
          iaculis at erat pellentesque. Orci eu lobortis elementum nibh tellus. Tincidunt lobortis feugiat vivamus at
          augue eget arcu dictum. Tortor at auctor urna nunc id cursus metus. Gravida arcu ac tortor dignissim. In
          tellus integer feugiat scelerisque varius morbi enim. Dolor sed viverra ipsum nunc aliquet bibendum enim
          facilisis. Volutpat lacus laoreet non curabitur gravida. Tincidunt arcu non sodales neque sodales ut etiam sit
          amet. Ac tortor dignissim convallis aenean et tortor at risus. Nec feugiat in fermentum posuere urna nec
          tincidunt praesent semper. Ac feugiat sed lectus vestibulum mattis ullamcorper velit. Amet dictum sit amet
          justo donec enim diam. Et pharetra pharetra massa massa ultricies mi quis hendrerit. Sit amet consectetur
          adipiscing elit duis tristique sollicitudin nibh. Platea dictumst quisque sagittis purus sit. Duis ut diam
          quam nulla porttitor massa id neque aliquam. Ac orci phasellus egestas tellus. Auctor urna nunc id cursus
          metus aliquam eleifend mi.
        </user>
      </Tokenize>,
    )
    .untilComplete();
  expect(result.toString()).toBe('PASS');
});

bench('tokenize 1000 messages (gpt-4o)', async () => {
  const result = await createRenderContext()
    .render(
      <Tokenize expected={7000} model="gpt-4o">
        {Array.from({ length: 500 }, () => (
          <>
            <user>Hello, world!</user>
            <assistant>Hello, world!</assistant>
          </>
        ))}
      </Tokenize>,
    )
    .untilComplete();
  expect(result.toString()).toBe('PASS');
});

bench('tokenize function definitions and function calls (gpt-4o)', async () => {
  const result = await createRenderContext()
    .render(
      <Tokenize expected={58} model="gpt-4o">
        <functionDefinition
          name="myAwesomeFunction"
          parameters={{
            type: 'object',
            properties: {
              test: { type: 'boolean' },
            },
          }}
        >
          Does some awesome stuff.
        </functionDefinition>
        <user>Hello, world!</user>
        <assistant>Hello, world!</assistant>
        <functionCall id="1" name="myAwesomeFunction">
          {'{'} "test": true {'}'}
        </functionCall>
        <functionResponse id="1" name="myAwesomeFunction">
          {'{'} "test": true {'}'}
        </functionResponse>
      </Tokenize>,
    )
    .untilComplete();
  expect(result.toString()).toBe('PASS');
});

bench('tokenize images', async () => {
  const result = await createRenderContext()
    .render(
      <Tokenize expected={92} model="gpt-4o">
        <user>
          Here's an image!
          <image src="https://example.com/image.jpg" />
        </user>
      </Tokenize>,
    )
    .untilComplete();
  expect(result.toString()).toBe('PASS');
});
