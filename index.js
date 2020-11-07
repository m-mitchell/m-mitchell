const { Octokit } = require("@octokit/rest");
const Cryptr = require('cryptr');

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = 'm-mitchell';
const repo = 'm-mitchell';
const committer = {
	name: 'Meg Mitchell',
	email: 'mail@megmitchell.ca'
}
const cryptr = new Cryptr(process.env.ENCRYPT_KEY);
let puzzle = '';
let guessedLetters = [];

async function loadGameState(){
	const result = await octokit.repos.getContent({
		owner,
		repo,
		path: 'puzzle.dat',
		ref: 'hangman',
	});
	let content = Buffer.from(result.data.content, 'base64').toString();
	content = cryptr.decrypt(content);
	content = JSON.parse(content);

	puzzle = content.puzzle;
	guessedLetters = content.guessedLetters;
}


async function saveGameState(message){
	let content = JSON.stringify({
		guessedLetters,
		puzzle
	});
	content = cryptr.encrypt(content);
	content = Buffer.from(content).toString('base64');

	const result = await octokit.repos.getContent({
		owner,
		repo,
		ref: 'hangman',
		path: 'puzzle.dat',
	});
	let sha = result.data.sha;

	return octokit.repos.createOrUpdateFileContents({
        owner,
		repo,
		branch: 'hangman',
		path: 'puzzle.dat',
		message: message,
		content,
		committer: committer,
		author: committer,
		sha
	});
}

async function resetGame() {
	console.log('resetting puzzle');
	guessedLetters = [];

	const result = await octokit.repos.getContent({
		owner,
		repo,
		path: 'wordlist.dat',
		ref: 'hangman',
	});
	let content = Buffer.from(result.data.content, 'base64').toString();
	lines = content.split('\n');

	puzzle = lines[Math.rand(Math.floor(Math.random() * lines.length))];
}

function generatePuzzleLinks() {
	const alphabet = [
		'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q',
		'R','S','T','U','V','W','X','Y','Z'
	];
	let linkContent = '';
	alphabet.forEach(letter => {
		if (guessedLetters.indexOf(letter) > -1) {
			linkContent += `\n ${letter}`;
		} else {
			linkContent += `\n [${letter}](https://github.com/m-mitchell/m-mitchell/issues/new?title=guess+${letter}&body=Just+push+%27Submit+new+issue%27.)`;
		}
	});
	return linkContent;
}

async function displayPuzzle(message) {
	let displayPuzzle = '';
	puzzle.split('').forEach(letter => {
		if (guessedLetters.indexOf(letter) == -1) {
			displayPuzzle += '\\\-';
		} else {
			displayPuzzle += letter;
		}
	});

	let content = `
# Guess the Word

${displayPuzzle}

Guessed letters: ${guessedLetters.join(', ')}
${generatePuzzleLinks()}
	`;
	content = Buffer.from(content).toString('base64');


	const result = await octokit.repos.getContent({
		owner,
		repo,
		ref: 'hangman',
		path: 'README.md',
	});
	let sha = result.data.sha;

	return octokit.repos.createOrUpdateFileContents({
        owner,
		repo,
		branch: 'hangman',
		path: 'README.md',
		message: message,
		content,
		committer: committer,
		author: committer,
		sha
	});

}

function getPuzzleString() {

}

async function guessLetter(letter, issue) {
	guessedLetters.push(letter);
	await replyToIssue(issue.number, 'Guessing '+letter);
	console.log(guessedLetters);

	let finished = true;
	let displayPuzzle = '';
	puzzle.split('').forEach(letter => {
		if (guessedLetters.indexOf(letter) == -1) {
			displayPuzzle += '-';
			finished = false;
		} else {
			displayPuzzle += letter;
		}
	});
	console.log(displayPuzzle);
	if (finished) {
		await resetGame();
	}
}

async function processIssue(issue) {
	const regex = /guess ([A-Z])/;
	const match = issue.title.match(regex)[1];
	if (guessedLetters.indexOf(match) != -1) {
		return replyToIssue(issue.number, 'Letter already guessed.');
	} else if (match) {
		return guessLetter(match, issue);
	} else {
		return replyToIssue(issue.number, 'Bad format for guess.');
	}
}


function replyToIssue(issue_number, text) {
	return octokit.issues.createComment({
		owner,
		repo,
		issue_number,
		body: text,
	});
}

async function handleNewIssues() {
	try {
		await loadGameState();

		const { data } = await octokit.issues.listForRepo({
			owner,
			repo,
			state: 'open'
		  });

		await data.forEach(async (issue) => {
			await processIssue(issue);

			octokit.issues.update({
			  owner,
			  repo,
			  issue_number: issue.number,
			  state: 'closed'
			});
		});

		await saveGameState('Updating puzzle');
		await displayPuzzle('Displaying puzzle');
	} catch (e) {
		console.log(e);
	}

}

handleNewIssues();
