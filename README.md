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
    ---
* If in the content "{{" or "}}" or "{%" or "%}" are present (determined as Liquid template) please escape them with {{site.lcb}} for "{" and {{site.rcb}} for "}"
