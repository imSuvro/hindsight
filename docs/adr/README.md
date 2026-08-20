# Architecture decision records

One file per decision that would be expensive to reverse, written when the
decision was made rather than reconstructed afterwards. Each records what the
situation was, what was chosen, what was rejected and why, and what the choice
costs — because the cost is the part that gets forgotten.

| #                                   | Decision                                                      | Status   |
| ----------------------------------- | ------------------------------------------------------------- | -------- |
| [0001](0001-hosting.md)             | Host on Vercel Hobby with MongoDB Atlas M0                    | Accepted |
| [0002](0002-tamper-evidence.md)     | Make the record tamper-evident with a per-user hash chain     | Accepted |
| [0003](0003-scoring-methodology.md) | Score with the Brier score, decomposed, with Wilson intervals | Accepted |
| [0004](0004-scheduled-jobs.md)      | Drive resurfacing from a GitHub Actions schedule              | Accepted |
| [0005](0005-email-provider.md)      | Send review notifications through Brevo                       | Accepted |
| [0006](0006-authentication.md)      | Authenticate with Better Auth, OAuth only                     | Accepted |
| [0007](0007-domain-taxonomy.md)     | Five fixed domains for scoring, free tags for everything else | Accepted |

A decision that turns out to be wrong is superseded by a new record rather than
edited, so the reasoning that led there stays readable.
