import { Octokit } from "octokit"
import OptionParser from "option-parser"
import cliProgress from "cli-progress"


// returns an object describing the number of times, an author has contributed to a file
async function getContributionData(owner, repo, commitCount) {
    const octokit = new Octokit({
        auth: '',
    })

    // find all commits in the repo and determine their shas
    let commitList;
    try {
        if (commitCount <= 0) {
            commitList = await octokit.paginate(
                octokit.rest.repos.listCommits, {
                owner: owner,
                repo: repo,
                per_page: 100,
            })
        } else {
            commitList = (await octokit.rest.repos.listCommits({
                owner: owner,
                repo: repo,
                per_page: commitCount
            })).data
        }
    } catch (error) {
        return {}
    }


    const shasWithAuthor = commitList.map(commit => [commit.sha, commit.author.login])
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
    bar.start(shasWithAuthor.length, 0)
    let barCount = 0

    // this object saves the number of contributions per file for every author
    const contributionsPerAuthor = Object.fromEntries(shasWithAuthor.map(([sha, author]) => [author, {}]))

    // fetch commits based on their sha and add contributions to the object
    for (const [sha, author] of shasWithAuthor) {
        const commit = await octokit.rest.repos.getCommit({
            owner: owner,
            repo: repo,
            ref: sha
        })

        // Beware: this treats renamed files as if they were new ones
        for (const file of commit.data.files) {
            contributionsPerAuthor[author][file.filename] = (file.filename in contributionsPerAuthor[author]) ?
                contributionsPerAuthor[author][file.filename] + 1 : 1
        }
        barCount++
        bar.update(barCount)
    }
    bar.stop()

    return contributionsPerAuthor;
}

// uses the contribution data to determine the pairs of developers, who are coupled the most
function computeBestCouples(contributionsPerAuthor) {
    let maxCoupleCount = 0
    // list of tuples, which include dev pairs and the number of times they have commited to the same files
    let bestCouples = []
    const authorsList = Object.keys(contributionsPerAuthor)

    // compare all pairs of developers
    for (let i = 0; i < authorsList.length; i++) {
        for (let j = i + 1; j < authorsList.length; j++) {
            let coupleCount = 0
            const author1 = authorsList[i]
            const author2 = authorsList[j]

            // for every file, compare the number of contributions to it
            for (const filename of Object.keys(contributionsPerAuthor[author1])) {
                if (filename in contributionsPerAuthor[author2]) {
                    coupleCount += Math.min(contributionsPerAuthor[author1][filename], contributionsPerAuthor[author2][filename])
                }
            }
            if (coupleCount === 0) {
                continue
            }
            if (coupleCount === maxCoupleCount) {
                bestCouples.push([author1, author2, coupleCount])
            } else if (coupleCount > maxCoupleCount) {
                bestCouples = [[author1, author2, coupleCount]]
                maxCoupleCount = coupleCount
            }
        }
    }
    return bestCouples;
}


async function main() {
    const usageText = 'Usage:\nnode main.js [repo-owner] [repo-name]\n-n\t The number of past commits to consider for the analysis. Goes up to 100. Leave out to include all commits'
    let exit = false
    let commitCount = -1

    const parser = new OptionParser()
    parser.addOption('n', 'number', '').argument('').action((value) => commitCount = parseInt(value))
    parser.addOption('h', 'help', '').action(() => {
        exit = true
    })
    let unparsed;

    try {
        unparsed = parser.parse()
    } catch (error) {
        console.log(usageText)
        return
    }

    if (unparsed.length !== 2 || isNaN(commitCount)) {
        console.log(usageText)
        return
    }

    let owner = unparsed[0]
    let repo = unparsed[1]

    const contributionsPerAuthor = await getContributionData(owner, repo, commitCount)

    if (Object.entries(contributionsPerAuthor).length === 0) {
        console.log('The owner or the repo may not exist')
        return
    }

    const bestCouples = computeBestCouples(contributionsPerAuthor)

    if (bestCouples.length === 0) {
        console.log('No coupling found between any developer')
        console.log('This may be, because all the developers work independently, or too few commits have been analyzed')
    } else if (bestCouples.length === 1) {
        console.log(`The developers, who are coupled the most are: ${bestCouples[0][0]} and ${bestCouples[0][1]}!`)
        console.log(`They have contributed to the same files a total number of ${bestCouples[0][2]} times`)
    } else {
        console.log('There are multiple pairs of developers, who are coupled the most!')
        console.log(`The pairs have contributed to the same files a total number of ${bestCouples[0][2]} times`)
        console.log('The pairs are:')
        bestCouples.forEach((couple) => {console.log(`${couple[0]} and ${couple[1]}`)})

    }
}

main()
