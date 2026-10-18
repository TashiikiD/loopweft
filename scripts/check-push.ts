// The pre-push hook's privacy check (.githooks/pre-push): no private word in anything the push sends. Git
// gives the hook the remote's name and URL, and lists the refs being pushed on its standard input;
// findPrivateWordsInPush (test/private-words.ts) reads those refs' names, their annotated tags and every
// commit they send that the URL does not already hold. Where no words are set (privateWords, see
// CONTRIBUTING.md), as on CI, it checks nothing.
//
//   node scripts/check-push.ts [<remote> [<url>]] < <the lines git gives the pre-push hook>
//
// Without a URL (or a remote) every commit the refs reach is read.
import { text } from 'node:stream/consumers';
import { privateWords } from '../packages/model/scripts/polycrisis-deck.ts';
import { findPrivateWordsInPush } from '../test/private-words.ts';

const [remote, url] = process.argv.slice(2);
const words = privateWords();
if (words.length > 0) {
  const found = findPrivateWordsInPush(process.cwd(), words, await text(process.stdin), url ?? remote);
  if (found.length > 0) {
    process.stderr.write(
      [
        'This push would send a private word (privateWords, see CONTRIBUTING.md), so nothing was pushed:',
        ...found.map((place) => `  ${place}`),
        'Take it out (git commit --amend changes the last commit), then push again.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
  process.stdout.write('No private word in what this push sends.\n');
}
