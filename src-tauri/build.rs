use std::fs;
use std::path::{Path, PathBuf};

struct SkillMetadata {
    name: &'static str,
    source: &'static str,
    source_type: &'static str,
    skill_path: &'static str,
}

const BUNDLED_SKILLS: &[SkillMetadata] = &[
    SkillMetadata {
        name: "hyperwiki",
        source: "local/hyperwiki",
        source_type: "local",
        skill_path: "SKILL.md",
    },
    SkillMetadata {
        name: "parallel-dev-worktrees",
        source: "johnpolacek/parallel-dev-worktrees-skill",
        source_type: "github",
        skill_path: "SKILL.md",
    },
    SkillMetadata {
        name: "agent-browser",
        source: "agent-browser",
        source_type: "npm",
        skill_path: "SKILL.md",
    },
    SkillMetadata {
        name: "portless",
        source: "vercel-labs/portless",
        source_type: "github",
        skill_path: "SKILL.md",
    },
    SkillMetadata {
        name: "frontend-design",
        source: "wshobson/agents",
        source_type: "github",
        skill_path: "skills/frontend-design/SKILL.md",
    },
    SkillMetadata {
        name: "grill-with-docs",
        source: "local/grill-with-docs",
        source_type: "local",
        skill_path: "SKILL.md",
    },
    SkillMetadata {
        name: "make-interfaces-feel-better",
        source: "local/make-interfaces-feel-better",
        source_type: "local",
        skill_path: "SKILL.md",
    },
    SkillMetadata {
        name: "shadcn",
        source: "shadcn/ui",
        source_type: "github",
        skill_path: "skills/shadcn/SKILL.md",
    },
    SkillMetadata {
        name: "tailwind-design-system",
        source: "wshobson/agents",
        source_type: "github",
        skill_path: "plugins/frontend-mobile-development/skills/tailwind-design-system/SKILL.md",
    },
];

fn main() {
    generate_bundled_agent_skills();
    tauri_build::build();
}

fn generate_bundled_agent_skills() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let bundle_root = manifest_dir.join("agent-skills");
    let out_path = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("bundled_agent_skills.rs");
    let mut output = String::from("const BUNDLED_AGENT_SKILLS: &[BundledAgentSkill] = &[\n");

    println!("cargo:rerun-if-changed={}", bundle_root.display());

    for skill in BUNDLED_SKILLS {
        let skill_root = bundle_root.join(skill.name);
        let mut files = Vec::new();
        collect_files(&skill_root, &mut files);
        files.sort();
        let computed_hash = computed_hash(&skill_root, &files);

        output.push_str("    BundledAgentSkill {\n");
        output.push_str(&format!("        name: {:?},\n", skill.name));
        output.push_str(&format!("        source: {:?},\n", skill.source));
        output.push_str(&format!("        source_type: {:?},\n", skill.source_type));
        output.push_str(&format!("        skill_path: {:?},\n", skill.skill_path));
        output.push_str(&format!("        computed_hash: {:?},\n", computed_hash));
        output.push_str("        files: &[\n");
        for file in files {
            let relative = file
                .strip_prefix(&skill_root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            output.push_str("            BundledAgentSkillFile {\n");
            output.push_str(&format!("                relative_path: {:?},\n", relative));
            output.push_str(&format!("                bytes: include_bytes!({:?}),\n", file));
            output.push_str("            },\n");
        }
        output.push_str("        ],\n");
        output.push_str("    },\n");
    }

    output.push_str("];\n");
    fs::write(out_path, output).unwrap();
}

fn collect_files(root: &Path, files: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(root).unwrap_or_else(|error| {
        panic!("could not read bundled skill directory {}: {error}", root.display())
    }) {
        let path = entry.unwrap().path();
        if path.is_dir() {
            collect_files(&path, files);
        } else if path.is_file() {
            files.push(path);
        }
    }
}

fn computed_hash(skill_root: &Path, files: &[PathBuf]) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for file in files {
        let relative = file
            .strip_prefix(skill_root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        hash = fnv1a(hash, relative.as_bytes());
        hash = fnv1a(hash, &[0]);
        hash = fnv1a(hash, &fs::read(file).unwrap());
        hash = fnv1a(hash, &[0xff]);
    }
    format!(
        "{:016x}{:016x}{:016x}{:016x}",
        hash,
        hash.rotate_left(13) ^ 0x9e3779b97f4a7c15,
        hash.rotate_left(29) ^ 0xbf58476d1ce4e5b9,
        hash.rotate_left(43) ^ 0x94d049bb133111eb
    )
}

fn fnv1a(mut hash: u64, bytes: &[u8]) -> u64 {
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}
