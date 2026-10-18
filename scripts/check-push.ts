// The pre-push hook's privacy check (.githooks/pre-push): no private word in anything the push sends. Git
// lists the refs being pushed on the hook's standard input; findPrivateWordsInPush (test/private-words.ts)
// reads every commit they send. Where no words are set (privateWords, see CONTRIBUTING.md), as on CI, it
// checks nothing.
//
//   node scripts/check-push.ts < <the lines git gives the pre-push hook>
import { text } from 'node:stream/consumers';
import { privateWords } from '../packages/model/scripts/polycrisis-deck.ts';
import { findPrivateWordsInPush } from '../test/private-words.ts';

const words = privateWords();
if (words.length > 0) {
  const found = findPrivateWordsInPush(process.cwd(), words, await text(process.stdin));
  if (found.length > 0) {
    process.stderr.write(
      [
        'This push would send a private word (privateWords, see CONTRIBUTING.md), so nothing was pushed:',
        ...found.map((place) => `  ${place}`),
        'Take it out of those commits (git commit --amend changes the last one), then push again.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
  process.stdout.write('No private word in what this push sends.\n');
}
