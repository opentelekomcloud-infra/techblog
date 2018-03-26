# Techblog der Open Telekom Cloud

## How to write a blueprint

* Place your md file in the _blueprints folder and name it YYYY-MM-DD-<<<YOUR_WONDERFUL_NAME>>>.md
* at the head of the file place a "Front Matters" header:
    ---
    layout: post
    title:  "Openshift Origin on FedoraAtomic"
    date:   2018-03-23 12:10:29 +0100
    categories: otc blueprint
    excerpt_separator: <!--more-->
    lcb: "{"
    rcb: "}"
    ---
* In the content of your post/blueprint ensure, that each curly bracket "{" and "}" are replaced with {{page.lcb}} for "{" and {{page.rcb}} for "}"
